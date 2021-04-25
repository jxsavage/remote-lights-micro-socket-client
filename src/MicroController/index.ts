import {
  generateId,
  convertMicroResponseToMicroEntity,
  MicroEntityActionType, MicroActionsInterface,
} from 'Shared/store';
import {
  MicroStateResponse, MicroActionType,
  MicroId, SegmentId, REVERSE_MICRO_COMMAND,
  MicroState, MICRO_COMMAND,
} from 'Shared/types'
import { SerialWithParser } from 'SocketClient/serial';
import log from 'Shared/logger';
import { SharedEmitEvent } from 'Shared/socket';

const {
  GET_STATE, RESIZE_SEGMENTS_FROM_BOUNDARIES,
  SET_SEGMENT_EFFECT, SPLIT_SEGMENT, MERGE_SEGMENTS, SET_MICRO_BRIGHTNESS,
  SET_MICRO_ID, SET_SEGMENT_ID, WRITE_EEPROM, RESET_MICRO_STATE
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
  initialized: boolean;
  static WRITE_EEPROM_COMMAND = [WRITE_EEPROM];
  static RESET_MICRO_STATE_COMMAND = [RESET_MICRO_STATE];
  static GET_STATE_COMMAND = [MICRO_COMMAND.GET_STATE];

  constructor(
    serialPort: SerialWithParser,
    socket: SocketIOClient.Socket
  ){
    this.initialized = false;
    this.serial = serialPort;
    this.socket = socket;

    
    const { serial: { parser }, dataHandler } = this;
    parser.on('data', dataHandler);
    
  }
  writeSerial = (command: number[]): void => {
    log('infoHeader', `Executing command ${REVERSE_MICRO_COMMAND[command[0]-1]}`);
    const commandString = JSON.stringify(command);
    log('info', `Arguments: ${commandString}`);
    this.serial.port.write(`${commandString}\n`);
    this.serial.port.drain();
  }
  writeEEPROM = (): void => {
    log('info', `Writing EEPROM to Microcontroller ${this.microId}`);
    this.writeSerial(MicroController.WRITE_EEPROM_COMMAND);
  }
  reset = (): void => {
    log('info', `Resetting Microcontroller ${this.microId}...`);
    this.writeSerial(MicroController.RESET_MICRO_STATE_COMMAND);
  }
  getMicroState = (): void => {
    this.writeSerial(MicroController.GET_STATE_COMMAND);
  }
  splitSegment:
  MicroActionsInterface['splitSegment'] = (
    { newEffect, direction, segmentId, newSegmentId }
  ) => {
    const command = [SPLIT_SEGMENT, newEffect,  direction, segmentId, newSegmentId];
    this.writeSerial(command);
  }
  mergeSegments:
  MicroActionsInterface['mergeSegments'] = (
    { direction, segmentId }
  ) => {
    const command = [MERGE_SEGMENTS, direction, segmentId];
    this.writeSerial(command);
  }
  resizeSegmentsFromBoundaries:
  MicroActionsInterface['resizeSegmentsFromBoundaries'] = (
    { segmentBoundaries }
  ) => {
    const command = [RESIZE_SEGMENTS_FROM_BOUNDARIES, segmentBoundaries];
    this.writeSerial(command as number[]);
  }
  setMicroBrightness:
  MicroActionsInterface['setMicroBrightness'] = (
    { brightness }
  ) => {
    const command = [SET_MICRO_BRIGHTNESS, brightness];
    this.writeSerial(command);
  }
  setSegmentEffect:
  MicroActionsInterface['setSegmentEffect'] = (
    { newEffect, segmentId }
  ) => {
    const command = [SET_SEGMENT_EFFECT, newEffect, segmentId];
    this.writeSerial(command);
  }
  setMicroId = (microId: MicroId): void => {
    log('info', `Setting microId to ${microId}`);
    const command = [SET_MICRO_ID, microId];
    this.writeSerial(command);
  }
  setSegmentId = (oldId: SegmentId, newId: SegmentId): void => {
    const command = [SET_SEGMENT_ID, oldId, newId];
    this.writeSerial(command);
  }
  dataHandler = (data: string): void => {
    const handleInfo = (microStateResponse: MicroStateResponse): void => {
      const [, microId] = microStateResponse;
      const microState = microStateResponse;
      if(microId === 0) {
        const newMicroId = generateId();
        log('bgRed', `microcontroller had an id of 0, re-initializing to ${newMicroId}`);
        microState[1] = newMicroId;
        this.setMicroId(newMicroId);
        const [,,,,segmentsResponse] = microState;
        microState[4] = segmentsResponse.map((segment) => {
          const newId = generateId();
          this.setSegmentId(segment[3], newId);
          segment[3] = newId;
          return segment;
        });
      }
      this.microId = microState[1];
      this.socket.emit(MicroEntityActionType.ADD_MICROS, convertMicroResponseToMicroEntity(microState));
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
    return new Promise((resolve) => {
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
          socket.on(MicroActionType.RESET_MICRO_STATE, this.reset);
          socket.on(MicroActionType.WRITE_EEPROM, this.writeEEPROM);
          socket.on(MicroActionType.SPLIT_SEGMENT, this.splitSegment);
          socket.on(MicroActionType.MERGE_SEGMENTS, this.mergeSegments);
          socket.on(SharedEmitEvent.RE_INIT_APP_STATE, this.getMicroState);
          socket.on(MicroActionType.SET_SEGMENT_EFFECT, this.setSegmentEffect);
          socket.on(MicroActionType.SET_MICRO_BRIGHTNESS, this.setMicroBrightness);
          socket.on(MicroActionType.RESIZE_SEGMENTS_FROM_BOUNDARIES, this.resizeSegmentsFromBoundaries);
        }
      }, 100, resolve);
      this.getMicroState();
    });
  }
}
export default MicroController;