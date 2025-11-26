// backend/src/transactions/transactions.controller.ts
import { Controller, Get, Headers, Res } from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { Response } from "express";

@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async getTransactions(@Headers("authorization") authHeader: string, @Res() res: Response) {
    try {
      const token = authHeader?.split(" ")[1];
      if (!token) return res.status(401).json({ message: "Unauthorized" });

      const transactions = await this.transactionsService.getUserTransactions(token);
      return res.json({ transactions });
    } catch (err: any) {
      console.error(err);
      return res.status(err.status || 500).json({ message: err.message || "Server error" });
    }
  }
}
