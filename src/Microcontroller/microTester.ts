

import testData from 'Shared/test';
import Microcontroller from "Microcontroller";
import CommandQueue, { Command } from './CommandQueue';
import { MicroEntity, MicrosAndSegmentsEntity, MicroState, MicroStateResponse, SegmentEntity, SegmentId } from 'Shared/types';
import CMD from './Command';
import { MicroResponseHeader } from 'Shared/types/micro';
import log from 'Shared/logger';
import { convertMicroResponseToMicroEntity } from 'Shared/store';
import { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } from 'deep-object-diff';
function compare<O = any>(expected: Record<string, any>, received: Record<string, any>) {
  let success = true;
  type DetailedDiff = {deleted: O, added: O, updated: O};
  const {deleted, added, updated} = detailedDiff(expected, received) as DetailedDiff;
  if(Object.keys(deleted).length) {
    success = false;
    log('textGreen', 'Expected:');
    log('textGreen', JSON.stringify(deleted, null, '  '));
  }
  if(Object.keys(added).length) {
    success = false;
    log('textRed', 'Received:');
    log('textRed', JSON.stringify(added, null, '  '));
  }
  if(Object.keys(updated).length) {
    success = false;
    log('bgRed', ' Differences Detected: ');
    Object.keys(updated).forEach((key: any) => {
      log('textGreen', `\nExpected:\n${key}: ${JSON.stringify(expected[key])}\n`);
      log('textRed', `Received:\n${key}: ${JSON.stringify(received[key])}`);
    })
  }
  return success;
}
function convertToSegmentsByIndex(
  entity: SegmentEntity, microSegIds: SegmentId[]
): SegmentEntity {
  return microSegIds.reduce((byIndex, segId, i) => {
    byIndex.allIds.push(i);
    byIndex.byId[i] = entity.byId[segId];
    return byIndex;
  }, {allIds: [], byIds: {}} as unknown as SegmentEntity);
}
function compareMicros(received: MicroEntity | MicrosAndSegmentsEntity, expected: MicroEntity | MicrosAndSegmentsEntity) {
  let receivedMicros: MicroEntity;
  let expectedMicros: MicroEntity;
  if('micros' in received && 'micros' in expected) {
    receivedMicros = received.micros;
    expectedMicros = expected.micros;
  } else if (!('micros' in received) && !('micros' in expected)) {
    receivedMicros = received;
    expectedMicros = expected;
  } else {
    throw new Error('Function requires to have 2 MicroEntity or 2 MicroAndSegmentEntity');
  }
  
  const [recievedId] = receivedMicros.allIds;
  const [expectedId] = expectedMicros.allIds;
  const receivedMicro = receivedMicros.byId[recievedId];
  const expectedMicro = expectedMicros.byId[expectedId];
  
  const microPassed = compare(expectedMicro, receivedMicro);
  
  let segmentsPassed = true;
  if('segments' in received && 'segments' in expected) {
    const expectedSegmentIds = expectedMicro.segmentIds;
    const expectedSegments = expected.segments;
    const receivedSegmentIds = receivedMicro.segmentIds;
    const receivedSegments = received.segments;
    const expectedByIndex = convertToSegmentsByIndex(expectedSegments, expectedSegmentIds);
    const receivedByIndex = convertToSegmentsByIndex(receivedSegments, receivedSegmentIds);
    segmentsPassed = compare(expectedByIndex, receivedByIndex);
  }
  return microPassed && segmentsPassed;
}
type BrightnessMeta = typeof testData.setBrightness;
type RawMeta = typeof testData.raw
export default function microTester(micro: Microcontroller, queue: CommandQueue): void {
  const successCount = 0;
  const failedCount = 0;
  let before: MicrosAndSegmentsEntity;
  let after: MicrosAndSegmentsEntity;
  let lastState: MicrosAndSegmentsEntity;
  let firstSegmentId: SegmentId;
  let secondSegmentId: SegmentId;
  const readyForTest = false;
  const testLoadEEPROM = () => {
    const commandId = queue.nextId();
    const getState = new Command<MicrosAndSegmentsEntity, null, MicroStateResponse>(
      {
        meta: null,
        command: CMD.loadEEPROM(),
        responseHeader: MicroResponseHeader.TEST,
        transform: convertMicroResponseToMicroEntity,
        callbacks: [
          (state) => {
            const testPassed = compareMicros(state.micros, testData.raw.micros());
            if(testPassed) {
              log('bgGreen', ' Load EEPROM Test Passsed! ');
            } else {
              log('bgRed', ' Load EEPROM Test Failed! ')
            }
          }
        ]
      }
    )
    return getState;
  }
  const getBrightnessTestCommand = () => {
    const commandId = queue.nextId();
    const {action, after} = testData.setBrightness;
    const testBrightness = new Command<MicrosAndSegmentsEntity, null, MicroStateResponse>(
      {
        id: commandId,
        meta: null,
        command: CMD.setBrightness(action.payload),
        transform: convertMicroResponseToMicroEntity,
        responseHeader: MicroResponseHeader.TEST,
        callbacks: [
          (state, command) => {
            const testPassed = compareMicros(state.micros, after());
            if(testPassed) {
              log('bgGreen', ' Set Brightness Test Passsed! ');
            } else {
              log('bgRed', ' Set Brightness Test Failed! ');
            }
          }
        ]
      }
    )
    return testBrightness;
  }
  [
    testLoadEEPROM(),
    getBrightnessTestCommand()
  ].forEach((command) => {
    queue.push(command);
  })
}