import { 
  AllActions, MicroActionsInterface, MicroState,
  addMicros, MICRO_COMMAND,
} from '../Shared/store'
import { MicroStateResponse } from '../Shared/store/types';
import { SocketDestination } from '../Shared/socket';
import { SerialWithParser } from '../SocketClient/serial';
import log from '../Shared/logger';
import { generateId, convertMicroResponseToMicroEntity, } from '../Shared/store/utils';
import { MicroActionType, MicroEntityTypes } from '../Shared/store/actions';

const {
  GET_STATE, RESIZE_SEGMENTS_FROM_BOUNDARIES,
  SET_SEGMENT_EFFECT, SPLIT_SEGMENT, MERGE_SEGMENTS, SET_MICRO_BRIGHTNESS,
  SET_MICRO_ID, SET_SEGMENT_ID,
} = MICRO_COMMAND;
enum MicroMessage {
  ERROR = 130, WARNING, INFO, DEBUG, PING, PONG, COMMAND_SUCCESS, COMMAND_FAILURE
}
const { ERROR, WARNING, INFO, DEBUG, PING } = MicroMessage;
type MicroResponse = number[];

export class MicroController implements MicroActionsInterface {
  microId!: MicroState['microId'];
  serial: SerialWithParser;
  socket: SocketIOClient.Socket;
  dispatch: (action: AllActions, destination: string) => void;
  initialized: boolean;
  static cmdGetInfo = `${JSON.stringify([MICRO_COMMAND.GET_STATE])}\n`;
  
  constructor(
    serialPort: SerialWithParser,
    dispatch: (action: AllActions, destination: string) => void,
    socket: SocketIOClient.Socket
  ){
    this.initialized = false;
    this.serial = serialPort;
    this.socket = socket;
    this.dispatch = dispatch;

    
    const { serial: { parser }, dataHandler } = this;
    parser.on('data', dataHandler);
    
  }
  splitSegment:
  MicroActionsInterface['splitSegment'] = (
    { newEffect, direction, segmentId, newSegmentId }
  ) => {
    const command = JSON.stringify([SPLIT_SEGMENT, newEffect,  direction, segmentId, newSegmentId]);
    this.serial.port.write(`${command}\n`);
    this.serial.port.drain();
  }
  mergeSegments:
  MicroActionsInterface['mergeSegments'] = (
    { direction, segmentId }
  ) => {
    const command = JSON.stringify([MERGE_SEGMENTS, direction, segmentId]);
    this.serial.port.write(`${command}\n`);
    this.serial.port.drain();
  }
  resizeSegmentsFromBoundaries:
  MicroActionsInterface['resizeSegmentsFromBoundaries'] = (
    { segmentBoundaries }
  ) => {
    const command = JSON.stringify([RESIZE_SEGMENTS_FROM_BOUNDARIES, segmentBoundaries]);
    this.serial.port.write(`${command}\n`);
    this.serial.port.drain();
  }
  setMicroBrightness:
  MicroActionsInterface['setMicroBrightness'] = (
    { brightness }
  ) => {
    const command = JSON.stringify([SET_MICRO_BRIGHTNESS, brightness]);
    this.serial.port.write(`${command}\n`);
    this.serial.port.drain();
  }
  setSegmentEffect:
  MicroActionsInterface['setSegmentEffect'] = (
    { newEffect, segmentId }
  ) => {
    const command = JSON.stringify([SET_SEGMENT_EFFECT, newEffect, segmentId]);
    this.serial.port.write(`${command}\n`);
    this.serial.port.drain();
  }
  dataHandler = (data: string): void => {
    const handleInfo = (microStateResponse: MicroStateResponse): void => {
      const [, microId] = microStateResponse;
      const microState = microStateResponse;
      if(microId === 0) {
        const newMicroId = generateId();
        microState[1] = newMicroId;
        const setMicroIdCommand = JSON.stringify([SET_MICRO_ID, newMicroId]);
        this.serial.port.write(`${setMicroIdCommand}\n`);
        const [,,,,segmentsResponse] = microState;
        microState[4] = segmentsResponse.map((segment) => {
          const oldId = segment[3];
          const newId = generateId();
          segment[3] = newId;
          const setSegmentIdCommand = JSON.stringify([SET_SEGMENT_ID, oldId, newId]);
          this.serial.port.write(`${setSegmentIdCommand}\n`);
          return segment;
        })
      }
      // this.dispatch(
      //   addMicros(
      //     convertMicroResponseToMicroEntity(microState)
      // ), SocketDestination.WEB_CLIENTS);
      this.microId = microState[1];
      this.socket.emit(MicroEntityTypes.ADD_MICROS, convertMicroResponseToMicroEntity(microState));
    }
    const handleResponse = (response: MicroResponse): void => {
      const responseType = response[0];
      switch(responseType) {
        case GET_STATE:
          handleInfo(response as MicroStateResponse); break;
        case ERROR:
        case WARNING:
        case INFO:
        case DEBUG:
        case PING:
          response.forEach((value, i) => {
            const colors: Parameters<typeof log>[0][] = [
              'bgGreen', 'textGreen', 
              'bgRed', 'textRed', 
              'bgYellow', 'textYellow',
            ];
            if (i === 0) {
              log('info', `${MicroMessage[value]}`);
            } else {
              log(colors[(i-1)%6], `${value}`);
            }
          });
          
          log('infoHeader', `${new Date().getMinutes()}:${new Date().getSeconds()}`);
          break;
        default:
          log('bgRed', `Error: Uknown response type:`);
          log('textRed', JSON.stringify(response, null,'  '));
      }
    }
    try {
      const response = JSON.parse(data);
      handleResponse(response);
    } catch(err) {
      console.log(`ERROR:\n${err}\nResponse:\n${data.toString()}\n`);
    }
  }
  initialize = (): Promise<MicroController> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return new Promise((resolve, reject) => {
      const initMsg = setInterval(() => console.log('Waiting for initialization...'), 3000);
      const initializing = setInterval((resolve) => {
        if(this.microId) {
          log('info', `Microconroller ${this.microId} initialized.`)
          this.initialized = true;
          resolve(this);
          clearInterval(initializing);
          clearInterval(initMsg);
          const { socket, microId } = this;
          socket.emit('INIT_MICRO', microId);
          socket.on(MicroActionType.SPLIT_SEGMENT, this.splitSegment);
          socket.on(MicroActionType.MERGE_SEGMENTS, this.mergeSegments);
          socket.on(MicroActionType.SET_SEGMENT_EFFECT, this.setSegmentEffect);
          socket.on(MicroActionType.SET_MICRO_BRIGHTNESS, this.setMicroBrightness);
          socket.on(MicroActionType.RESIZE_SEGMENTS_FROM_BOUNDARIES, this.resizeSegmentsFromBoundaries);
        }
      }, 100, resolve);

      this.serial.port.write(MicroController.cmdGetInfo);
      this.serial.port.drain();
    });
  }
}

export default MicroController;