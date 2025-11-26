// backend/src/volts/volts.controller.ts
import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { VoltsService } from "./volts.service";

@Controller("volts")
export class VoltsController {
  constructor(private readonly voltsService: VoltsService) {}

  // === Reserve a Volt ===
  @Post("reserve")
  async reserveVolt(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token)
        return res.status(401).json({ message: "Unauthorized: No token provided" });

      const decoded = await getAuth().verifyIdToken(token);
      const userId = decoded.uid;
      const { voltId, studentId } = body;

      if (!voltId || !studentId)
        return res.status(400).json({ message: "Missing voltId or studentId" });

      await this.voltsService.markVoltReserved(voltId, userId, studentId);
      return res.status(200).json({ success: true, message: "Volt reserved" });
    } catch (err: any) {
      console.error("reserveVolt error:", err.message);
      return res.status(400).json({ message: err.message || "Failed to reserve volt" });
    }
  }

  // === Release a Volt ===
  @Post("release")
  async releaseVolt(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token)
        return res.status(401).json({ message: "Unauthorized: No token provided" });

      const decoded = await getAuth().verifyIdToken(token);
      const userId = decoded.uid;
      const { voltId } = body;

      if (!voltId)
        return res.status(400).json({ message: "Missing voltId" });

      await this.voltsService.markVoltAvailable(voltId);
      return res.status(200).json({ success: true, message: "Volt released" });
    } catch (err: any) {
      console.error("releaseVolt error:", err.message);
      return res.status(400).json({ message: err.message || "Failed to release volt" });
    }
  }
}
