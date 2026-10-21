import { Router } from 'express';
import {
  getChatFields,
  getChatFieldById,
  createChatField,
  updateChatField,
  deleteChatField,
  reorderChatFields,
} from '../controllers/chatfield.controller';
import { validateId } from '../middleware/validateId';

const router = Router();
router.param('id', validateId);

router.get('/', getChatFields);
router.post('/', createChatField);
router.patch('/reorder', reorderChatFields);
router.get('/:id', getChatFieldById);
router.patch('/:id', updateChatField);
router.delete('/:id', deleteChatField);

export default router;
