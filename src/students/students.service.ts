// backend/src/students/students.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { firestore } from '../firebase/firebase.admin';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor() {}

  // CHANGED: Now async, checks Firestore 'student_whitelist' collection
  async isValidStudent(studentId: string): Promise<boolean> {
    try {
      const doc = await firestore.collection('student_whitelist').doc(studentId).get();
      return doc.exists;
    } catch (error: any) { // FIX: Added ': any' type assertion
      this.logger.error(`Error checking student validity: ${error.message}`);
      return false;
    }
  }

  // CHANGED: Now async, fetches data from Firestore
  async getStudentInfo(studentId: string): Promise<any> {
    try {
      const doc = await firestore.collection('student_whitelist').doc(studentId).get();
      return doc.exists ? doc.data() : null;
    } catch (error: any) { // FIX: Added ': any' type assertion
      this.logger.error(`Error getting student info: ${error.message}`);
      return null;
    }
  }
}