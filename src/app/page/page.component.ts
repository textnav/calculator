import {
  Component,
  OnInit,
  Input,
  ViewChild,
  AfterViewInit,
  ElementRef,
} from '@angular/core';

import { PageService } from '../services/page.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-page',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss'],
})
export class PageComponent implements OnInit, AfterViewInit {
  @ViewChild('textarea') textarea!: ElementRef<HTMLTextAreaElement>;
  @Input() expression: string = '';

  public output$: Subject<string>;

  constructor(private pageService: PageService) {
    this.output$ = pageService.output$;
  }
  ngAfterViewInit(): void {
    this.pageService.textarea = this.textarea.nativeElement;
    setTimeout(() => this.handleChange(), 0);
  }

  ngOnInit(): void {}

  handleChange() {
    this.pageService.handleChange();
  }

  onClick() {
    this.pageService.throttleRead.next();
  }

  onkeydown($event: Event) {
    this.pageService.onkeydown($event as KeyboardEvent);
  }
}
