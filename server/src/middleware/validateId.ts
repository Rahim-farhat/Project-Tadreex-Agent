import { Request, Response, NextFunction } from 'express';

// IDs are UUIDs, or 24-char hex ObjectIds kept from the MongoDB migration
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

// router.param handler: rejects malformed IDs before they reach the database
export const validateId = (
  _req: Request,
  res: Response,
  next: NextFunction,
  id: string,
): void => {
  if (!ID_PATTERN.test(id)) {
    res.status(404).json({ message: 'Resource not found' });
    return;
  }
  next();
};
