import { Controller, Get, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore } from '../firebase/firebase.admin';

@UseGuards(FirebaseAuthGuard)
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const { user } = req;

    // 🔒 Admin-only access
    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }

    // --- Users ---
  const usersSnap = await firestore.collection('users')
    .where('role', '==', 'user')
    .get();

  const totalUsers = usersSnap.size;

  console.log(`Total users with role "user": ${totalUsers}`);

    // --- Volts ---
    const voltsSnap = await firestore.collection('volts').get();
    let activeRentals = 0;
    let availableVolts = 0;
    voltsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === 'rented') activeRentals++;
      if (data.status === 'available') availableVolts++;
    });

    // --- Transactions (Nested under users) ---
    const transactionsSnap = await firestore.collectionGroup('transactions').get();
    let totalRevenue = 0;
    const revenueTimeline: Record<string, number> = {};
    const rentalsTimeline: Record<string, number> = {};

    transactionsSnap.forEach((doc) => {
      const data = doc.data();

      // 💰 Revenue from top-ups
      if (data.type === 'topup' && data.status === 'completed') {
        totalRevenue += Number(data.amount) || 0;

        const dateKey = data.completedAt?.toDate?.().toLocaleDateString('en-US') || 'Unknown';
        revenueTimeline[dateKey] = (revenueTimeline[dateKey] || 0) + (Number(data.amount) || 0);
      }

      // 📦 Count rentals
      if (data.type === 'rent') {
        const dateKey = data.startTime?.toDate?.().toLocaleDateString('en-US') || 'Unknown';
        rentalsTimeline[dateKey] = (rentalsTimeline[dateKey] || 0) + 1;
      }
    });

    return {
      totalUsers,
      activeRentals,
      availableVolts,
      totalRevenue,
      revenueTimeline,
      rentalsTimeline,
    };
  }
}
