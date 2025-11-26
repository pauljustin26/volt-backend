// backend/src/transactions/transactions.service.ts
import { Injectable, UnauthorizedException, InternalServerErrorException } from "@nestjs/common";
import { firestore } from "../firebase/firebase.admin";
import { getAuth } from "firebase-admin/auth";

@Injectable()
export class TransactionsService {
  async getUserTransactions(idToken: string) {
    if (!idToken) throw new UnauthorizedException("No token provided");

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (err) {
      throw new UnauthorizedException("Invalid token");
    }

    try {
      const userRef = firestore.collection("users").doc(uid);
      const txnsCollection = userRef.collection("transactions");

      // Fetch wallet top-ups
      const walletSnapshot = await txnsCollection.where("type", "==", "topup").get();
      const walletTxns = walletSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          type: "topup",
          reference: doc.id,
          date: data.completedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(),
          description: "Wallet Top-up",
          amount: data.amount || 0,
          status: data.status || "pending",
        };
      });

      // Fetch rentals and returns
      const rentalSnapshot = await txnsCollection.where("type", "in", ["rent", "return"]).get();
      const rentalTxns = rentalSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          type: data.type,
          reference: doc.id,
          date: data.startTime?.toDate?.() || new Date(),
          description: data.type === "rent" ? `Volt Rental ${data.voltID}` : `Volt Return ${data.voltID}`,
          amount: data.totalFee || data.fee || 0,
          status: data.status || "completed",
        };
      });

      // Combine and sort transactions by date descending
      const allTxns = [...walletTxns, ...rentalTxns].sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      );

      return allTxns;

    } catch (err) {
      console.error("Error fetching transactions for user:", uid, err);
      throw new InternalServerErrorException("Failed to fetch transactions");
    }
  }
}
