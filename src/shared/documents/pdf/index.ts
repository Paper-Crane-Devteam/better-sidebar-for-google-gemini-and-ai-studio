import { registerHandler } from '../registry';
import { outline, read } from './read';
import { edit, verify } from './edit';
registerHandler({ format: 'pdf', extensions: ['pdf'], outline, read, edit, verify });
