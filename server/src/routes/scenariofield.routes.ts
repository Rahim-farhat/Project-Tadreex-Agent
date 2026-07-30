import { Router } from 'express';
import { getScenarioFields, createScenarioField, getScenarioFieldById, updateScenarioField, deleteScenarioField } from '../controllers/scenariofield.controller';

const router = Router();

router.get('/', getScenarioFields);
router.post('/', createScenarioField);
router.get('/:id', getScenarioFieldById);
router.patch('/:id', updateScenarioField);
router.delete('/:id', deleteScenarioField);

export default router;
