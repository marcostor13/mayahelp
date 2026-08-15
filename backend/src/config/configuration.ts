export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mayahelp',
  /** Key for the stored third-party credentials at rest; falls back to the JWT secret. */
  encryptionKey: process.env.ENCRYPTION_KEY,
  /**
   * Public URL of this API. Only needed so the GitHub workflow that runs Claude Code
   * can report back; without it the run status is discovered by polling instead.
   */
  publicApiUrl: process.env.PUBLIC_API_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET ?? 'mayahelp-attachments',
    publicUrl: process.env.R2_PUBLIC_URL,
    /** Bucket separado para los dumps de base; si falta, se usa el de adjuntos. */
    backupsBucket: process.env.R2_BACKUPS_BUCKET,
  },
  backups: {
    /** Ruta al binario de mongodump; por defecto el del PATH de la imagen. */
    mongodumpPath: process.env.MONGODUMP_PATH,
  },
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY,
    model: process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-405b-instruct',
    visionModel:
      process.env.NVIDIA_VISION_MODEL ?? 'meta/llama-3.2-90b-vision-instruct',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    emailFrom:
      process.env.EMAIL_FROM ?? 'MayaHelp <notificaciones@mayahelp.local>',
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? 'ticket_notification',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es',
  },
});
