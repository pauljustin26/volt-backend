import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import csv from 'csv-parser';


@Injectable()
export class StudentsService {
  private students = new Map<string, any>();

  constructor() {
    this.loadStudents();
  }

  private loadStudents() {
    fs.createReadStream('src/data/students.csv')
      .pipe(csv())
      .on('data', (row) => {
        this.students.set(row.studentId, row);
      })
      .on('end', () => {
        console.log(`✅ Loaded ${this.students.size} student records`);
      });
  }

  isValidStudent(studentId: string): boolean {
    return this.students.has(studentId);
  }

  getStudentInfo(studentId: string) {
    return this.students.get(studentId);
  }
}
