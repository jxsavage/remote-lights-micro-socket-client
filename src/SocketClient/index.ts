import './socket';
import {
  rootReducer, AllActions, emitActionMiddleware,
  actionToMicroCommandMiddleware, RootState, addMicros,
  logActionMiddleware
} from '../Shared/store';
import {
  SharedEmitEvent, SocketSource, SocketDestination
} from '../Shared/socket';
import { createStore, applyMiddleware } from 'redux';
import initSocket, { emitAnyAction, socket } from './socket';
import { scanNewMicros, microIdSerialMap } from './serial';

export default function initClient(): void {
  initSocket();
  const {LIGHT_CLIENT} = SocketSource;
  const [andEmit, emitMiddlware] = emitActionMiddleware<RootState>(emitAnyAction, LIGHT_CLIENT);
  const middleware = applyMiddleware(
    logActionMiddleware(),
    emitMiddlware,
    actionToMicroCommandMiddleware(microIdSerialMap),
  );
  const store = createStore(
    rootReducer,
    middleware,
  );
  const dispatchAndEmit = (action: AllActions, destination: string): void => {
    store.dispatch(andEmit(action, destination))
  }
  setInterval(scanNewMicros(dispatchAndEmit), 3000);
  
  const { ROOT_ACTION, RE_INIT_APP_STATE } = SharedEmitEvent;
  socket.on(ROOT_ACTION, (action: AllActions) => {
    store.dispatch(action);
  });
  socket.on(RE_INIT_APP_STATE, () => {
    const {remoteLightsEntity: {micros, segments}} = store.getState();
    socket.emit(ROOT_ACTION, andEmit(addMicros({micros, segments}), SocketDestination.WEB_CLIENTS, true));
  });
}