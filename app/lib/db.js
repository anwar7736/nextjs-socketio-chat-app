const { DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
export const connectionStr =
  process.env.MONGODB_URI ||
  (DB_DATABASE && DB_USERNAME && DB_PASSWORD
    ? `mongodb+srv://${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD)}@cluster0.3hzyc.mongodb.net/${encodeURIComponent(DB_DATABASE)}?retryWrites=true&w=majority&appName=Cluster0`
    : "");
