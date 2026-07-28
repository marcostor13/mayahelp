import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { CountersService } from '../common/counters/counters.service';
import { UsersService } from '../users/users.service';
import { CategoriesService } from '../categories/categories.service';
import { TicketPriority, TicketSource } from '../common/enums/ticket.enum';

const TICKET_COUNTER_KEY = 'ticket';
const TICKET_CODE_BASE = 8000;

interface BulkImportRow {
  subject: string;
  description: string;
  category: string;
  priority?: string;
  clientName: string;
  clientEmail: string;
  clientCompany?: string;
}

export interface BulkImportRowError {
  row: number;
  reason: string;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: BulkImportRowError[];
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

export const BULK_IMPORT_TEMPLATE_CSV =
  'subject,description,category,priority,client_name,client_email,client_company\n' +
  '"Falla de conexión","No puedo acceder al panel desde ayer","Soporte Técnico",alta,"María Gómez",maria@example.com,"Acme Corp"\n';

@Injectable()
export class BulkImportService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    private readonly countersService: CountersService,
    private readonly usersService: UsersService,
    private readonly categoriesService: CategoriesService,
  ) {}

  parseFile(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });
  }

  async importRows(
    rawRows: Record<string, unknown>[],
  ): Promise<BulkImportResult> {
    const errors: BulkImportRowError[] = [];
    let created = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
      try {
        const row = this.normalizeRow(rawRows[i]);
        await this.importRow(row);
        created += 1;
      } catch (error) {
        errors.push({
          row: rowNumber,
          reason: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return { created, failed: errors.length, errors };
  }

  private normalizeRow(raw: Record<string, unknown>): BulkImportRow {
    const get = (...keys: string[]): string => {
      for (const key of keys) {
        const foundKey = Object.keys(raw).find(
          (k) => k.trim().toLowerCase() === key,
        );
        if (foundKey) {
          const value = cellToString(raw[foundKey]);
          if (value) return value;
        }
      }
      return '';
    };

    const subject = get('subject', 'asunto');
    const description = get('description', 'descripcion', 'descripción');
    const category = get('category', 'categoria', 'categoría');
    const priority = get('priority', 'prioridad');
    const clientName = get('client_name', 'cliente', 'nombre');
    const clientEmail = get('client_email', 'email', 'correo');
    const clientCompany = get('client_company', 'empresa');

    if (!subject) throw new Error('Falta el asunto (subject)');
    if (!description) throw new Error('Falta la descripción (description)');
    if (!category) throw new Error('Falta la categoría (category)');
    if (!clientEmail)
      throw new Error('Falta el correo del cliente (client_email)');
    if (!clientName)
      throw new Error('Falta el nombre del cliente (client_name)');

    return {
      subject,
      description,
      category,
      priority: priority || undefined,
      clientName,
      clientEmail,
      clientCompany: clientCompany || undefined,
    };
  }

  private async importRow(row: BulkImportRow): Promise<void> {
    const categoryDoc = await this.categoriesService.findByName(
      row.category,
      'ticket',
    );
    if (!categoryDoc) {
      throw new Error(`Categoría no encontrada: "${row.category}"`);
    }

    let priority: TicketPriority = TicketPriority.MEDIA;
    if (row.priority) {
      const normalized = row.priority.toLowerCase() as TicketPriority;
      if (!Object.values(TicketPriority).includes(normalized)) {
        throw new Error(
          `Prioridad inválida: "${row.priority}" (usa baja, media o alta)`,
        );
      }
      priority = normalized;
    }

    const client = await this.usersService.findOrCreateClient(
      row.clientEmail,
      row.clientName,
      row.clientCompany,
    );

    const sequence = await this.countersService.next(TICKET_COUNTER_KEY);
    const code = `TCK-${TICKET_CODE_BASE + sequence}`;

    await this.ticketModel.create({
      code,
      subject: row.subject,
      description: row.description,
      category: categoryDoc._id,
      client: client._id,
      priority,
      source: TicketSource.BULK_IMPORT,
    });
  }
}
