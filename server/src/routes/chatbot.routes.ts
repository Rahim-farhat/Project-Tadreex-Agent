import { Router } from 'express';
import {
  handleChatMessage,
  handleStepMessage,
  addScenarioBlock,
  deleteScenarioBlock,
  renameScenarioBlock,
  getScenarioBlocks,
  addScenarioStepBlock,
  deleteScenarioStepBlock,
  finalizeScenarioBlock,
} from '../controllers/chatbot.controller';

const router = Router();

// Info phase + confirm
router.post('/:token', handleChatMessage);

// Scenario phase (block management)
router.post('/:token/scenario/add', addScenarioBlock);
router.post('/:token/scenario/rename/:scenarioIndex', renameScenarioBlock);
router.post('/:token/scenario/delete/:scenarioIndex', deleteScenarioBlock);
router.get('/:token/scenario', getScenarioBlocks);

// Scenario steps
router.post('/:token/scenario/:scenarioIndex/step/add', addScenarioStepBlock);
router.post('/:token/scenario/:scenarioIndex/step/:stepIndex/delete', deleteScenarioStepBlock);
router.post('/:token/scenario/:scenarioIndex/step/:stepIndex', handleStepMessage);
router.post('/:token/scenario/:scenarioIndex/finalize', finalizeScenarioBlock);

export default router;