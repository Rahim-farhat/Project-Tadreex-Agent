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

import {
  getModeState,
  submitBrainstorm,
  backToBrainstorm,
  fixField,
  suggestField,
  refineChat,
  goFinal,
} from '../controllers/modeflow.controller';

const router = Router();

// Mode flow: brainstorm -> refine -> final
router.get('/:token/mode', getModeState);
router.post('/:token/brainstorm', submitBrainstorm);
router.post('/:token/brainstorm/back', backToBrainstorm);
router.post('/:token/refine/fix', fixField);
router.post('/:token/refine/suggest', suggestField);
router.post('/:token/refine/chat', refineChat);
router.post('/:token/final', goFinal);

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