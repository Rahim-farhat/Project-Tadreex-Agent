import { Router } from 'express';
import {
  getChatFields,
  getChatFieldById,
  createChatField,
  updateChatField,
  deleteChatField,
  reorderChatFields,
} from '../controllers/chatfield.controller';

const router = Router();

router.get('/', getChatFields);
router.post('/', createChatField);
router.patch('/reorder', reorderChatFields);
router.get('/:id', getChatFieldById);
router.patch('/:id', updateChatField);
router.delete('/:id', deleteChatField);

export default router;
