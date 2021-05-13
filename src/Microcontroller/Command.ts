import { 
  MergeSegmentsPayload, ResizeSegmentsFromBoundariesPayload,
  SetMicroBrightnessPayload, SetSegmentEffectPayload, SplitSegmentPayload,
} from 'Shared/store';
import {
  MicroId, SegmentId,
} from 'Shared/types';
import {
  CommandArray, CommandFn,
  MicroResponseHeader, SerialCommand,
  StaticCommandFn, MICRO_COMMAND
} from 'Shared/types/micro';
const {
  GET_STATE, RESIZE_SEGMENTS_FROM_BOUNDARIES,
  SET_SEGMENT_EFFECT, SPLIT_SEGMENT, MERGE_SEGMENTS, SET_MICRO_BRIGHTNESS,
  SET_MICRO_ID, SET_SEGMENT_ID, WRITE_EEPROM, LOAD_EEPROM, RESET_MICRO
} = MICRO_COMMAND;
type CommandId = number;
export default class MicrocontrollerCommand {
  private static RESET_MICRO_COMMAND = [RESET_MICRO];
  private static LOAD_EEPROM_COMMAND = [LOAD_EEPROM]
  private static WRITE_EEPROM_COMMAND = [WRITE_EEPROM];
  private static GET_STATE_COMMAND = [GET_STATE];
  static getState: StaticCommandFn = () => {
    return MicrocontrollerCommand.GET_STATE_COMMAND;
  }
  static resetMicro: StaticCommandFn = () => {
    return MicrocontrollerCommand.RESET_MICRO_COMMAND;
  }
  static loadEEPROM: StaticCommandFn = () => {
    return MicrocontrollerCommand.LOAD_EEPROM_COMMAND;
  }
  static writeEEPROM: StaticCommandFn  = () => {
    return MicrocontrollerCommand.WRITE_EEPROM_COMMAND;
  }
  static setMicroId: CommandFn<MicroId> = (microId) => {
    return [SET_MICRO_ID, microId];
  }
  static splitSegment: CommandFn<SplitSegmentPayload> = ({
    newEffect, direction, segmentId, newSegmentId,
  }) => {
    return [SPLIT_SEGMENT, newEffect,  direction, segmentId, newSegmentId];
  }
  static mergeSegments: CommandFn<MergeSegmentsPayload> = ({
    direction, segmentId,
  }) => {
    return [MERGE_SEGMENTS, direction, segmentId];
  }
  static setBrightness: CommandFn<SetMicroBrightnessPayload> = ({
    brightness
  }) => {
    return [SET_MICRO_BRIGHTNESS, brightness];
  }
  static setSegmentEffect: CommandFn<SetSegmentEffectPayload> = ({
    newEffect, segmentId,
  }) => {
    return [SET_SEGMENT_EFFECT, newEffect, segmentId];
  }
  static resizeSegments: CommandFn<ResizeSegmentsFromBoundariesPayload> = ({
    segmentBoundaries
  }) => {
    return [RESIZE_SEGMENTS_FROM_BOUNDARIES, segmentBoundaries];
  }
  static setSegmentId = (oldId: SegmentId, newId: SegmentId): CommandArray => {
    return [SET_SEGMENT_ID, oldId, newId];
  }
  static attachHeader = (
    command: CommandArray, id: CommandId, request: MicroResponseHeader,
  ): SerialCommand => {
    return [[id, request], command];
  }
}