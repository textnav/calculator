import { Component, OnInit } from '@angular/core';
import expression from './services/data';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'calculator';
  expression = '';

  ngOnInit(): void {
    this.expression = localStorage.getItem('input') || expression;
  }
}
