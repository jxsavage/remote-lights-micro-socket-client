import Bluez from 'bluez';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { exec } from 'node:child_process';
import log from 'Shared/logger';
import { RfcommDetails } from 'Shared/types/client';
import getSocket from './socket';
import { getClientId } from './util';

const REMOTE_LIGHTS_BT_DEVICE_NAME = 'Remote_Lights';
const socket = getSocket();
let bluez: Bluez | null = null;
/**
 * Creates a new bluez instance, adds on device listener,
 * then initializes it.
 * @returns Promise<void> that bluez is initialized.
 */
async function initBluez(): Promise<void> {
  const init = (resolve: (value: void | PromiseLike<void>) => void) => {
    bluez = new Bluez;
    bluez.on('device', bluezOnDevice);
    bluez.init().then(bluezPostInit).catch(console.error);
    resolve()
  }
  return new Promise((resolve) => {
    if(bluez) {
      /* 
        * Re-initializing bluez with an existing instance
        * causes a dbus error so we wait after nulling the
        * variable.
      */
      bluez = null;
      setTimeout(() => init(resolve), 1000);
    } else {init(resolve)}
  });
}
function getBluez(): Promise<Bluez> {
  return new Promise((resolve) => {
    const waitInterval = setInterval(
      () => {
        if(bluez) {
          clearInterval(waitInterval);
          resolve(bluez)
        } 
      }, 0
    )
  });
}

/**
 * Releases a rfcomm device.
 * @param dev rfcomm device number to release.
 */
function releaseRfcomm(dev: number) {
  log('bgRed', `Releasing device rfcomm${dev}`);
  spawn('rfcomm', ['release', `${dev}`]);
}
/**
 * Finds rfcomm devices by scanning /dev
 * @returns array of rfcomm device numbers
 */
async function findRfcomm(): Promise<number[]> {
  const allDevs = await readdir('/dev');
  const match = /rfcomm([0-9]+)/
  return allDevs.reduce((devs, dev) => {
    const matches = match.exec(dev);
    if(matches) {
      const devNum = Number(matches[1]);
      if(typeof devNum !== 'number') throw Error(`devNum is not a number, its value is ${devNum}`);
      log('textGreen', `rfcomm${devNum} found.`)
      devs.push(devNum);
    } 
    return devs;
  }, [] as number[]);
}

export async function getRfcommDetails(): Promise<RfcommDetails[]> {
  const rfcomms = await findRfcomm();
  const commsResults = rfcomms.map((devNum) => {
    const rfcommShow = spawn('rfcomm', ['show', `${devNum}`]);
    rfcommShow.stdout.setEncoding('utf-8');
    return new Promise<RfcommDetails>((resolve) => {
      rfcommShow.stdout.on('data', (data) => {
        const [dev,,,address] = String(data).split(' ');
        const [device] = dev.split(':');
        resolve({device, address});
        log('info', `${device} - ${address}`);
      });
    });
  });
  const result = await Promise.all(commsResults);
  return result;
}
const NUM_DEVS = 100;
const devQueue: number[] = [];
for(let i = 0; i <= NUM_DEVS; i++) {
  devQueue.push(i);
}
/**
 * Scans for existing rfcomm device and returns
 * a valid device number that does not conflict with
 * existing numbers.
 * @returns a valid number for a new rfcomm device.
 */
async function getNewDeviceNum(): Promise<number> {
  const usedDeviceNums = await findRfcomm();
  let newDevNum = 0;
  for(let i = 0; i <= NUM_DEVS; i++) {
    if(!usedDeviceNums.includes(i)) {
      newDevNum = i;
      break;
    }
  }
  return newDevNum;
}
/**
 * Creates an rfcomm device to communicate with a microcontroller.
 * @param address MAC address of the bt device to connect to.
 * @param channel BT channel to use for the rfcomm device.
 */
export async function spawnRfcomm(address: string, channel = 1): Promise<void> {
  
  const device = await getNewDeviceNum();

  const rfcomm = spawn('rfcomm', ['--raw', 'connect', `${device}`, `${address}`, `${channel}`]);

  rfcomm.on('disconnect', () => {
    log('bgRed', `disconnect: rfcomm ${address}`);
    releaseRfcomm(device);
  });
  rfcomm.on('error', (error) => {
    log('bgRed', `error: rfcomm ${address}`);
    log('bgRed', `error: ${error.message}`);
    releaseRfcomm(device);
  })
  rfcomm.on('exit', (code, signal) => {
    log('bgRed', `exit: rfcomm ${address}`);
    log('bgRed', `exit code: ${code}`);
    log('bgRed', `exit signal: ${signal}`);
    releaseRfcomm(device);
  });
  rfcomm.on('message', (code, signal) => {
    log('bgGreen', `message: rfcomm ${address}`);
    log('bgGreen', `message code: ${code}`);
    log('bgGreen', `message signal: ${signal}`);
  });
}
/**
 * Connects to bluetooth device on connection.
 * @param address MAC Address.
 * @param props properties of BT device.
 */
function bluezOnDevice(address: string, props: Bluez.DeviceProps): void {
  setTimeout(
    () => connectToDevice(address, props).catch(console.error),
    1000
  );
}
/**
 * After bluez initialization register agent,
 * start device discovery.
 */
async function bluezPostInit(): Promise<void> {
  const bluezInstance = await getBluez();
  // Register Agent that accepts everything and uses key 1234
  await bluezInstance.registerSimplePairingAgent();
  log('bgGreen', " Bluetooth Agent Registered ");

  // listen on first bluetooth adapter
  const adapter = await bluezInstance.getAdapter();
  await adapter.StartDiscovery();
  log('textGreen', " Discovering Remote Lights Devices...");
}
export async function getVisibleDevices(): Promise<Bluez.DeviceProps[]> {
  const bluezInstance = await getBluez();
  const lightsDevices = bluezInstance.getAllDevicesProps().filter((props) => {
    return props?.Name === REMOTE_LIGHTS_BT_DEVICE_NAME;
  });
  return lightsDevices;
} 
 /**
 * Connects to devices based on name.
 * @param address MAC Address.
 * @param props properties of BT device.
 */
async function connectToDevice(address: string, props: Bluez.DeviceProps): Promise<void> {
  if (props?.Name === REMOTE_LIGHTS_BT_DEVICE_NAME) {
    // Get bluez instance.
    const bluezInstance = await getBluez();
    log('textGreen', ` Detected device: ${address} - ${props.Name}`);
    // Get the device interface
    const device = await bluezInstance.getDevice(address);
    // Pair with the device if not already done
    if (!props.Paired) {
      await device.Pair().catch((err) => {
        console.error("Error while pairing to device " + address + ": " + err.message);
      });
    } else {
      log('textGreen', ` ${address} - already paired. `);
    }
    // Connect with device if not already
    if(!props.Connected) {
      log('textGreen', " Unconnected Light Found spawning port... ");
      spawnRfcomm(address);
    } else {
      log('textGreen', ` ${address} - already connected. `);
    }
  }
}

export default initBluez;