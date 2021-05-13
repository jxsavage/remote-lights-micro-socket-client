# Microcontroller socket client
## Overview
- finds available microcontrollers connected via USB.
- finds microcontrollers attached via bluetooth.
## Bluetooth system configuration
[https://github.com/tinyprinter/node-bluetooth-serial-port](Bluetooth Library)

## Bluetooth Linux Config
- `sudo usermod -a -G netdev $USER` needed for bluetooth admin script.
- `sudo apt-get install libglib2.0-dev libdbus-1-dev` needed for node bluez package.
- `hcitool dev` confirm we have a bt device.
- `bluetoothctl` > `scan` > `pair xx:xx:xx:xx:xx:xx` & confirm.
- `sudo chmod u+s /usr/bin/rfcomm` set SUID for rfcomm so it runs as root for script.
- `sudo rfcomm --raw connect 0 xx:xx:xx:xx:xx:xx 1`
