import { Router } from 'express';
import { organizersRouter } from './organizers';
import { appointmentsRouter } from './appointments';
import { slotsRouter } from './slots';
import { googleRouter } from './google';
import { webappRouter } from './webapp';
import { optionsRouter } from './options';

export const apiRouter = Router();

apiRouter.use('/organizers', organizersRouter);
apiRouter.use('/appointments', appointmentsRouter);
apiRouter.use('/organizers', slotsRouter);
apiRouter.use('/organizers', optionsRouter);
apiRouter.use('/google', googleRouter);
apiRouter.use('/webapp', webappRouter);
