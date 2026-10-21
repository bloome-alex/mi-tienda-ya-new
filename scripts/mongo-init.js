/* Ejecutado por mongosh, exclusivamente al inicializar un volumen Mongo vacío. */
const databaseName = process.env.MONGO_INITDB_DATABASE || 'mi_tienda_ya_2';
const applicationUser = process.env.MONGO_APP_USER;
const applicationPassword = process.env.MONGO_APP_PASSWORD;

if (!/^[A-Za-z0-9_]+$/.test(databaseName)) throw new Error('MONGO_DB_NAME sólo admite letras, números y guiones bajos.');
if (!applicationUser || !applicationPassword) throw new Error('Falta configurar el usuario de MongoDB para la aplicación.');

const applicationDatabase = db.getSiblingDB(databaseName);
if (!applicationDatabase.getUser(applicationUser)) {
  applicationDatabase.createUser({
    user: applicationUser,
    pwd: applicationPassword,
    roles: [{ role: 'readWrite', db: databaseName }],
  });
}
