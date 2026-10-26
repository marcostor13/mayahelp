import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Schema, SchemaType } from 'mongoose';

/** Una referencia de un schema, con el `$set` que la pasa de texto a ObjectId. */
export interface ReferencePath {
  /** Ruta tal como se consulta: `client`, `projects`, `comments.author`. */
  path: string;
  /** Etapa `$set` de un update por pipeline que convierte esa ruta. */
  set: Record<string, unknown>;
}

/**
 * Convierte a ObjectId las referencias que quedaron guardadas como texto.
 *
 * Los schemas declaraban las referencias con `type: Types.ObjectId`, y `@Prop` arma eso
 * como `Mixed`: no castea, así que cada referencia se guardaba tal como llegaba — casi
 * siempre el id en texto. Los filtros de acceso comparan contra ObjectId y un texto
 * nunca coincide, por eso los tickets de un proyecto solo los veía el súper usuario.
 * Corregido el tipo, las consultas castean a ObjectId y dejarían de encontrar los
 * datos viejos: esta migración los pone al día.
 *
 * Corre en `onModuleInit` para terminar antes que cualquier `onApplicationBootstrap`
 * (como `SuperAdminBootstrap`) y antes de que la API acepte requests. Es idempotente:
 * filtra por `$type: 'string'`, así que con la base ya convertida no toca nada.
 */
@Injectable()
export class ReferenceIdsMigration implements OnModuleInit {
  private readonly logger = new Logger(ReferenceIdsMigration.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit(): Promise<void> {
    for (const model of Object.values(this.connection.models)) {
      const collection = model.collection;
      for (const reference of referencePaths(model.schema)) {
        // Directo sobre la colección: sin casteo de Mongoose y sin tocar `updatedAt`.
        const result = await collection.updateMany(
          { [reference.path]: { $type: 'string' } },
          [{ $set: reference.set }],
        );
        const label = `${collection.collectionName}.${reference.path}`;
        if (result.modifiedCount > 0) {
          this.logger.log(
            `${label}: ${result.modifiedCount} documento(s) con la referencia pasada de texto a ObjectId.`,
          );
        }
        // Un texto que no es un id válido queda como estaba: hay que revisarlo a mano.
        const invalid = result.matchedCount - result.modifiedCount;
        if (invalid > 0) {
          this.logger.warn(
            `${label}: ${invalid} documento(s) con una referencia en texto que no es un id válido.`,
          );
        }
      }
    }
  }
}

/** Las referencias de un schema que se guardan como ObjectId, sueltas, en arrays o en subdocumentos. */
export function referencePaths(schema: Schema): ReferencePath[] {
  const paths: ReferencePath[] = [];
  schema.eachPath((path, type) => {
    if (path === '_id') return;
    if (type.instance === 'ObjectId') {
      paths.push({ path, set: { [path]: toObjectId(`$${path}`) } });
    } else if (isObjectIdArray(type)) {
      paths.push({
        path,
        set: {
          [path]: { $map: { input: `$${path}`, in: toObjectId('$$this') } },
        },
      });
    } else if (isDocumentArray(type)) {
      // Una sola etapa por campo del subdocumento: `comments.author` reescribe `comments`.
      for (const inner of referencePaths(type.schema)) {
        if (inner.path.includes('.')) continue;
        paths.push({
          path: `${path}.${inner.path}`,
          set: {
            [path]: {
              $map: {
                input: `$${path}`,
                in: {
                  $mergeObjects: [
                    '$$this',
                    { [inner.path]: toObjectId(`$$this.${inner.path}`) },
                  ],
                },
              },
            },
          },
        });
      }
    }
  });
  return paths;
}

/** Texto con un id válido → ObjectId; cualquier otra cosa queda igual. */
function toObjectId(value: string) {
  return {
    $cond: [
      { $eq: [{ $type: value }, 'string'] },
      { $convert: { input: value, to: 'objectId', onError: value } },
      value,
    ],
  };
}

function isObjectIdArray(type: SchemaType): boolean {
  const embedded = (type as SchemaType & { embeddedSchemaType?: SchemaType })
    .embeddedSchemaType;
  return type.instance === 'Array' && embedded?.instance === 'ObjectId';
}

function isDocumentArray(
  type: SchemaType,
): type is SchemaType & { schema: Schema } {
  return (
    type.instance === 'Array' &&
    (type as SchemaType & { schema?: Schema }).schema instanceof Schema
  );
}
