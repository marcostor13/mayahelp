export enum TicketStatus {
  ABIERTO = 'abierto',
  EN_PROCESO = 'en_proceso',
  RESUELTO = 'resuelto',
  CERRADO = 'cerrado',
}

export enum TicketPriority {
  BAJA = 'baja',
  MEDIA = 'media',
  ALTA = 'alta',
}

/** Channel the ticket came in through. */
export enum TicketSource {
  PORTAL = 'portal',
  PUBLIC_LINK = 'public_link',
  BULK_IMPORT = 'bulk_import',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  API = 'api',
}
