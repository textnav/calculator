import { MathType, MathNode, EvalFunction } from 'mathjs';

export interface Line {
  selected?: boolean;
  positionStart: number;
  positionEnd: number;
  index: number;
  code: string;
  result: MathType;
  error: string;
  indent: number;
  summing: string | null;
  closed: boolean;
  children: Line[];
  parsed?: MathNode;
  compiled?: EvalFunction;
}

export interface Scope {
  [is: string]: MathType;
}

export interface ItemState {
  raw: string;
  selection: string;
  lines: Line[];
  cache: {
    [id: string]: {
      parsed?: MathNode;
      compiled?: EvalFunction;
    };
  };
  selectionStart: number;
  selectionEnd: number;
  last: number;
  height: number;
}
