import Bluez from 'bluez';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import log from 'Shared/logger';
import { RfcommDetails } from 'Shared/types/client';
const REMOTE_LIGHTS_BT_DEVICE_NAME = 'Remote_Lights';
const NUM_DEVS = 100;
type rfcommPath = string;
type deviceAddress = string;
export default class Bluetooth {
  private bluez: Bluez | null;
  private initialized: boolean;
  private deviceQueue: number[];
  private rfcommToAddressMap: Map<rfcommPath, deviceAddress>;
  constructor() {
    this.deviceQueue = [];
    this.rfcommToAddressMap = new Map<rfcommPath, deviceAddress>();
    for(let i = 0; i <= NUM_DEVS; i++) {
      this.deviceQueue.push(i);
    }
    this.initialized = false;
    this.bluez = null;
  }
  getRfcommDetails = async (): Promise<RfcommDetails[]> => {
    const rfcomms = await this.findRfcomm();
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
  getVisibleDevices = async (): Promise<Bluez.DeviceProps[]> => {
    const bluezInstance = await this.getBluez();
    const lightsDevices = bluezInstance.getAllDevicesProps().filter((props) => {
      return props?.Name === REMOTE_LIGHTS_BT_DEVICE_NAME;
    });
    return lightsDevices;
  }
  private removeDeviceAtPath = (path: string): boolean => {
    const address = this.rfcommToAddressMap.get(path);
    let success = false;
    if(address !== undefined) {
      this.removeDevice(address);
      this.rfcommToAddressMap.delete(path);
      success = true;
      log('textGreen', ` [ ${path} ] device removed. `)
    } else {
      log('bgRed', ` [ ${path} ] did not exist in rfcomm to address map.`)
    }
    return success;
  }
  /**
   * Creates an rfcomm device to communicate with a microcontroller.
   * @param address MAC address of the bt device to connect to.
   * @param channel BT channel to use for the rfcomm device.
   */
  spawnRfcomm = async (address: string, channel = 1): Promise<void> => {
    const device = await this.getNewDeviceNum();
    spawn(
      'rfcomm',
      ['bind', `${device}`, `${address}`, `${channel}`],
      {stdio: [process.stdin, process.stdout, process.stderr]},
    );
    this.addToRfcommAddressMap(`/dev/rfcomm${device}`, address);
  }
  releaseRfcomm = (dev: number): void => {
    log('bgRed', `Releasing device rfcomm${dev}`);
    spawn('rfcomm', ['release', `${dev}`]);
    this.removeDeviceAtPath(`/dev/rfcomm${dev}`);
  }
  private addToRfcommAddressMap = (path: string,  address: string): void => {
    this.rfcommToAddressMap.set(path, address);
  }
  /**
   * Scans for existing rfcomm device and returns
   * a valid device number that does not conflict with
   * existing numbers.
   * @returns a valid number for a new rfcomm device.
   */
  private getNewDeviceNum = async (): Promise<number> => {
    const usedDeviceNums = await this.findRfcomm();
    const newDevNum = this.deviceQueue.shift() as number;
    if(usedDeviceNums.includes(newDevNum)) {
      return this.getNewDeviceNum();
    }
    return newDevNum;
  }
  private removeDevice = (address: string) => {
    spawn(
      'bluetoothctl', ['remove', `${address}`],
      {stdio: [process.stdin, process.stdout, process.stderr]},
    );
  }
  private getBluez = (): Promise<Bluez> => {
    return new Promise((resolve) => {
      const waitInterval = setInterval(
        () => {
          if(this.bluez) {
            clearInterval(waitInterval);
            resolve(this.bluez);
          } 
        }, 100
      )
    });
  }
/**
 * Connects to devices based on name.
 * @param address MAC Address.
 * @param props properties of BT device.
 */
  private connectToDevice = async (
    address: string, props: Bluez.DeviceProps,
  ): Promise<void> => {
    if (props?.Name === undefined) this.removeDevice(address);
    if (props?.Name === REMOTE_LIGHTS_BT_DEVICE_NAME) {
      // Get bluez instance.
      const bluezInstance = await this.getBluez();
      log('textGreen', ` Detected device: ${address} - ${props.Name}`);
      // Get the device interface
      const device = await bluezInstance.getDevice(address);
      device.on('PropertiesChanged', (props) => {
        log('bgGreen', ` [ ${address} ] Properties changed. `);
        Object.entries(props).forEach((key, val) => {
          log('textGreen', `${key} : ${val}`);
        })
        const paired: boolean | undefined = props?.Paired;
        const connected: boolean | undefined = props?.Connected;
        if(paired != undefined || connected != undefined) {
          log('textGreen', `[ ${address} ] Connection status changed.`);
        }
      });
      // Pair with the device if not already done
      if (!props.Paired) {
        await device.Pair().catch(async (err) => {
          console.error("Error while pairing to device " + address + ": " + err.message);
          if(err.message == 'Page Timeout') {
            log('bgRed', ` Page Timeout detected ${address} removing device. `);
            this.removeDevice(address);
          }
        });
      } else {
        log('textGreen', ` ${address} - already paired. `);
      }
      // Connect with device if not already
      if(!props.Connected) {
        log('textGreen', " Unconnected Light Found spawning port... ");
        this.spawnRfcomm(address);
      } else {
        log('textGreen', ` ${address} - already connected. `);
      }
    }
  }
  private findRfcomm = async (): Promise<number[]> => {
    const allDevs = await readdir('/dev');
    const match = /rfcomm([0-9]+)/
    return allDevs.reduce((devs, dev) => {
      const matches = match.exec(dev);
      if(matches) {
        const devNum = Number(matches[1]);
        if(typeof devNum !== 'number') throw Error(`devNum is not a number, its value is ${devNum}`);
        log('textGreen', `[ /dev/rfcomm${devNum} ] found.`)
        devs.push(devNum);
      } 
      return devs;
    }, [] as number[]);
  }
  private initBluez = async (resolve: (bt: Bluetooth) => void) => {
    const bluez = new Bluez;
    bluez.on('device', (address: string, props: Bluez.DeviceProps): void => {
      setTimeout(
        () => this.connectToDevice(address, props).catch(console.error),
        1000
    )});
    try {
      await bluez.init();
      // Register Agent that accepts everything and uses key 1234
      await bluez.registerStaticKeyAgent('1234');
      log('bgGreen', ' Bluetooth Agent Registered ');
      // listen on first bluetooth adapter
      const adapterInstance = await bluez.getAdapter();
      await adapterInstance.StartDiscovery();
      log('textGreen', ' Discovering Remote Lights Devices...');
      this.bluez = bluez;
      resolve(this);
      this.initialized = true;
    } catch {
      log('bgRed', ` Bluez failed to initialize. `);
    }
    
  }
  initialize = async (): Promise<Bluetooth> => {
    return new Promise((resolve) => {
      if(this.bluez) {
        /* 
          * Re-initializing bluez with an existing instance
          * causes a dbus error so we wait after nulling the
          * variable.
        */
        this.bluez = null;
        setTimeout(() => this.initBluez(resolve), 5000);
      } else {this.initBluez(resolve)}
    });
  }
}