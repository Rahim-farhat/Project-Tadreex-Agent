import { Router } from 'express';
import {
  handleChatMessage,
  handleScenarioMessage,
  addScenarioBlock,
  deleteScenarioBlock,
  getScenarioBlocks,
} from '../controllers/chatbot.controller';

const router = Router();

// Info phase + confirm
router.post('/:token', handleChatMessage);

// Scenario phase
router.post('/:token/scenario/:scenarioIndex', handleScenarioMessage);
router.post('/:token/scenario/add', addScenarioBlock);
router.post('/:token/scenario/delete/:scenarioIndex', deleteScenarioBlock);
router.get('/:token/scenario', getScenarioBlocks);

export default router;
