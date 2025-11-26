// backend/src/volts/volts.service.ts
import { Injectable } from "@nestjs/common";
import { firestore } from "../firebase/firebase.admin";

@Injectable()
export class VoltsService {
  // Just read volts or update status (without creating transactions)
  async markVoltReserved(voltId: string, studentUID: string, studentId: string) {
    const voltRef = firestore.collection("volts").doc(voltId);
    await voltRef.update({
      status: "reserved",
      studentUID,
      studentId,
      reservedAt: new Date(),
    });
  }

  async markVoltAvailable(voltId: string) {
    const voltRef = firestore.collection("volts").doc(voltId);
    await voltRef.update({
      status: "available",
      studentUID: null,
      studentId: null,
      reservedAt: null,
      rentedAt: null,
    });
  }
}
