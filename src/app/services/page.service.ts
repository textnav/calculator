import { Injectable } from '@angular/core';
import { Line, ItemState, Scope } from '../page/page';
import { round, parse, add } from 'mathjs';
import { Subject, asyncScheduler } from 'rxjs';
import { throttleTime } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class PageService {
  state: ItemState = {
    raw: '',
    selection: '',
    lines: [],
    cache: {},
    selectionStart: 0,
    selectionEnd: 0,
    last: 0,
    height: 0,
  };
  public output$: Subject<string> = new Subject();
  public textarea!: HTMLTextAreaElement;

  public throttleRead: Subject<void> = new Subject();

  constructor() {
    this.throttleRead
      .pipe(
        throttleTime(50, asyncScheduler, { leading: false, trailing: true })
      )
      .subscribe(() => this.readSelection(this.state.lines));
  }

  readSelection(lines: Line[]) {
    if (this.textarea) {
      const selectionStart = this.textarea.selectionStart;
      const selectionEnd = this.textarea.selectionEnd;

      const selection = this.state.raw.substring(selectionStart, selectionEnd);

      const updatedLines: Line[] = lines.map((line) => {
        let selected = false;

        const leftCheck = line.positionEnd >= selectionStart;
        const rightCheck = line.positionStart <= selectionEnd;
        if (leftCheck && rightCheck) selected = true;

        return { ...line, selected };
      });

      this.state.selectionStart = selectionStart;
      this.state.selectionEnd = selectionEnd;
      this.state.selection = selection;
      this.state.lines = updatedLines;

      this.repaint(updatedLines);
    }
  }
  repaint(lines: Line[]) {
    let html = '';

    lines.forEach((line, index) => {
      let type: string = '';
      if (line.error) {
        if (line.selected) {
          type = 'empty';
        } else {
          if (line.summing && line.children.find((line) => line.error)) {
            type = 'empty';
          } else {
            type = 'error';
          }
        }
      } else if (line.summing) {
        type = 'result';
      } else if (line.result === undefined) {
        type = 'empty';
      } else if (line?.parsed?.isFunctionAssignmentNode) {
        type = 'empty';
      } else if (line?.parsed?.isConstantNode) {
        type = 'empty';
      } else if (
        line?.parsed?.isAssignmentNode &&
        line.parsed.value.isConstantNode
      ) {
        type = 'empty';
      } else {
        type = 'result';
      }

      let code = line.code || ' ';
      let prefix = ' ';
      for (let i = 0; i < line.indent; i++)
        code = code.replace(/(\| )? {2}/, '$1| ');

      if (type === 'error') prefix += '// ';
      // else if (type === 'result') prefix += '= ';

      let data = '';
      if (type === 'result') {
        if (typeof line.result === 'number') {
          data = round(line.result, 10).toString();
        } else {
          data = line.result.toString();
        }
      } else if (type === 'error') data = line.error;

      data = data.replace(/\n/g, '\\n');

      if (line.selected) type += ' highlight';

      const comment = code.trim().startsWith('#') ? ' comment' : '';
      let lineHtml = `<div class="${type}">`;
      if (!comment) {
        lineHtml += code
          .split(' ')
          .map((token) => {
            let tokenType = ' string';
            if (Number(token)) {
              tokenType = ' number';
            } else if (token.toLowerCase() === token.toUpperCase()) {
              tokenType = ' operator';
            }
            return `<span class="code${tokenType}" data-code="${token}"></span>`;
          })
          .join('&nbsp;');
      } else
        lineHtml += `<span class="code${comment}" data-code="${code}"></span>`;
      lineHtml += `<span class="flex-1"></span>`;
      lineHtml += `<span class="hint" data-prefix="${prefix}">${data}</span>`;
      lineHtml += '</div>';

      html += lineHtml;
    });

    this.output$.next(html);
  }

  reCalculate() {
    const lines: Line[] = [];
    const scope: Scope = {
      last: 0,
    };
    let position = 0;

    this.state.raw.split('\n').forEach((code, index) => {
      const line: Line = {
        index: index,
        code: code,
        positionStart: position,
        positionEnd: position + code.length,
        result: 0,
        error: '',
        indent: 0,
        summing: null,
        closed: false,
        parsed: undefined,
        compiled: undefined,
        children: [],
      };

      position += code.length + 1;

      if (line.code.substr(0, 2) === '  ') {
        const matchedCode = line.code.match(/\s+/) || [];
        const match = matchedCode[0].match(/\s\s/g);
        line.indent = match?.length || 0;
      }

      lines.push(line);

      lines.forEach((line2) => {
        if (line2.summing && line2.indent >= line.indent) {
          line2.closed = true;
          scope[line2.summing] = line2.result;
        }
      });

      if (line.code.trim().slice(-1) === ':' && line.code.indexOf('#') < 0) {
        line.summing = line.code.trim().slice(0, -1).trim();
        line.result = 0;
        line.closed = false;
        line.children = [];
      } else {
        try {
          const cache = this.state.cache;
          let cached = cache[line.code];
          if (!cached) {
            cached = {};
            cached.parsed = parse(line.code);
            cached.compiled = cached.parsed?.compile() || null;
            cache[line.code] = cached;
            this.state.cache = cache;
          }

          line.parsed = cached.parsed;
          line.compiled = cached.compiled;
          line.result = line.compiled?.evaluate(scope);
        } catch (e) {
          line.error = e.toString();
        }
      }

      if (line.result !== undefined) {
        lines.forEach((line2) => {
          if (line2.summing && !line2.closed && line2.indent < line.indent) {
            line2.children.push(line);

            try {
              line2.result = add(line2.result, line.result);
            } catch (e) {
              line2.error = e.toString();
            }
          }
        });

        scope.last = line.result;
      }
    });

    this.readSelection(lines);
  }

  handleChange() {
    const raw = this.textarea.value;
    const selectionStart = this.textarea.selectionStart;
    const selectionEnd = this.textarea.selectionEnd;

    if (
      raw !== this.state.raw ||
      selectionStart !== this.state.selectionStart ||
      selectionEnd !== this.state.selectionEnd
    ) {
      this.state.raw = raw;
      localStorage.setItem('input', this.state.raw);
      this.reCalculate();
    }
  }
  replaceSelection(replacement: string, select: boolean = false) {
    this.readSelection(this.state.lines);

    select = select === false ? false : true;

    const newSelectionStart = this.state.selectionStart;
    const newSelectionEnd = this.state.selectionStart + replacement.length;

    if (!document.execCommand('insertText', false, replacement)) {
      this.textarea.setRangeText(
        replacement,
        this.state.selectionStart,
        this.state.selectionEnd,
        'end'
      );
      this.handleChange();
    }

    if (select) {
      this.textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
    } else {
      this.textarea.setSelectionRange(newSelectionEnd, newSelectionEnd);
    }
  }
  duplicateSelection() {
    if (this.state.selection === '') {
      const line = this.state.lines.find((line) => line.selected);
      if (!line) return;

      this.textarea.setSelectionRange(line.positionEnd, line.positionEnd);
      this.replaceSelection('\n' + line.code);
      this.textarea.setSelectionRange(
        this.state.selectionStart,
        this.state.selectionStart
      );
    } else {
      const selection = this.state.selection;

      this.textarea.setSelectionRange(
        this.state.selectionEnd,
        this.state.selectionEnd
      );
      this.replaceSelection(selection);
      this.textarea.setSelectionRange(
        this.state.selectionStart - selection.length,
        this.state.selectionStart
      );
    }
  }
  addIndent() {
    let selectionStart = Infinity;
    let selectionEnd = 0;

    let affected = 0;
    let replacement = '';

    this.state.lines.forEach((line) => {
      if (!line.selected) return false;

      affected++;
      replacement += '  ' + line.code + '\n';

      if (line.positionStart <= selectionStart) {
        selectionStart = line.positionStart;
      }

      if (line.positionEnd > selectionEnd) {
        selectionEnd = line.positionEnd;
      }
      return;
    });

    if (affected === 0) return;

    replacement = replacement.substr(0, replacement.length - 1);

    const newSelectionStart = this.state.selectionStart + 2;
    const newSelectionEnd = this.state.selectionEnd + affected * 2;

    this.textarea.setSelectionRange(selectionStart, selectionEnd);
    this.replaceSelection(replacement);
    this.textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
  }
  removeIndent() {
    let selectionStart = Infinity;
    let selectionEnd = 0;

    let affected = 0;
    let replacement = '';

    this.state.lines.forEach((line) => {
      if (!line.selected) return false;
      if (line.code.substr(0, 2) !== '  ') return;

      affected++;
      replacement += line.code.substr(2) + '\n';

      if (line.positionStart <= selectionStart) {
        selectionStart = line.positionStart;
      }

      if (line.positionEnd > selectionEnd) {
        selectionEnd = line.positionEnd;
      }
      return;
    });

    if (affected === 0) return;

    replacement = replacement.substr(0, replacement.length - 1);

    const newSelectionStart = this.state.selectionStart - 2;
    const newSelectionEnd = this.state.selectionEnd - affected * 2;

    this.textarea.setSelectionRange(selectionStart, selectionEnd);
    this.replaceSelection(replacement);
    this.textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
  }
  onkeydown(event: KeyboardEvent) {
    this.readSelection(this.state.lines);
    this.throttleRead.next();

    if (event.key === 'Enter') {
      const line = this.state.lines.filter((line) => line.selected).pop();

      if (line) {
        let insert = '\n';
        if (line.summing) insert += '  ';
        for (let i = 0; i < line.indent; i++) insert += '  ';

        this.replaceSelection(insert, false);
        event.preventDefault();
      }
    }

    if (event.metaKey || event.ctrlKey) {
      if (event.key === 'd' || event.key === 'в') {
        this.duplicateSelection();
        event.preventDefault();
      }
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const selectionStart = this.textarea.selectionStart;
      const selectionEnd = this.textarea.selectionEnd;

      const selection = this.state.raw.substring(selectionStart, selectionEnd);

      if (selection.match(/^-?\d+\.?\d*$/)) {
        let newValue = Number(selection);

        if (event.key === 'ArrowUp') newValue += event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowDown') newValue -= event.shiftKey ? 10 : 1;

        this.replaceSelection(newValue.toString(), true);
        event.preventDefault();
      }
    }

    if (event.key === 'Tab') {
      if (event.shiftKey) {
        this.removeIndent();
      } else {
        this.addIndent();
      }

      event.preventDefault();
    }
  }
}
