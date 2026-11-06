declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string; email?: string };
      rawBody?: string;
      id: string;
    }
  }
}
export {};
