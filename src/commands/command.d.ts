import { Request, Response, RequestHandler } from 'express';

type CommandFn = (tags: string[], req: Request, res: Response, next: RequestHandler) => void;