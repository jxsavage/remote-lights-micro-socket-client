/* eslint-disable @typescript-eslint/no-explicit-any */
import log from "Shared/logger";
import { CommandArray, MicroResponseHeader } from "Shared/types/micro";

type fn = () => void;
type stateAndCmdCBFn<S, C> = (state: S, command: C) => void; 
type commandCallbacks<S, C> = fn | stateAndCmdCBFn<S, C>;
type TransformFn<Response, State> = (response: Response) => State
type CommandId = number;
interface CommandConstructor<State = any, Meta = any, Response = any> {
  meta: Meta;
  id?: CommandId;
  command: CommandArray;
  responseHeader: MicroResponseHeader;
  transform?: TransformFn<Response, State>;
  callbacks?: commandCallbacks<State, Command<State,Meta>>[];
}

export class Command<State = any, Meta = any, Response = any> {
  meta: Meta;
  id: CommandId | null;
  private command: CommandArray;
  private responseHeader: MicroResponseHeader;
  transform: TransformFn<Response, State> | null;
  callbacks: commandCallbacks<State, Command<State, Meta>>[];
  constructor({
    id, meta, command, callbacks, transform, responseHeader,
  }: CommandConstructor<State, Meta>) {
    this.meta = meta;
    this.command = command;
    this.id = id ? id : null;
    this.responseHeader = responseHeader;
    this.callbacks = callbacks ? callbacks : [];
    this.transform = transform ? transform : null;
  }
  get = (): string => JSON.stringify([[this.id, this.responseHeader], this.command]);
}


const MAX_ID = 10000;
export default class CommandQueue {
  private queue: Command[];
  private nextAvailableCommandId: number;
  private map: Map<CommandId, Command>;
  constructor() {
    this.queue = [];
    this.nextAvailableCommandId = 1;
    this.map = new Map<CommandId, Command>();
  }
  next = (): Command | undefined => {
    return this.queue.shift();
  }
  push = (command: Command): number => {
    if (command.id === null) {
      const id = this.nextId();
      command.id = id;
      this.map.set(id, command);
    } else {
      this.map.set(command.id, command);
    }
    return this.queue.push(command);
  }
  call = (id: CommandId, response: unknown): void => {
    log('bgGreen', `Command ${id} acknowledged by microcontroller.`);
    const command = this.map.get(id);
    if(!command) throw Error(`Command ${id} was missing, response: ${response}`);
    const { transform, callbacks } = command;
    if(transform) response = transform(response);
    callbacks.forEach((fn) => {
      fn(response, command);
    });
    this.map.delete(id);
  }
  nextId = (): number => {
    const id = this.nextAvailableCommandId;
    if(id >= MAX_ID) this.nextAvailableCommandId = 1;
    return this.nextAvailableCommandId++;
  }
}