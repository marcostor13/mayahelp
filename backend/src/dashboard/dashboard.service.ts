import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { TicketStatus } from '../common/enums/ticket.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
  ) {}

  async getStats(requester: AuthenticatedUser) {
    const scope =
      requester.role === Role.CLIENT ? { client: requester.userId } : {};

    const [openTickets, recentTickets, allForCsat, allForResponse, weeklyRaw] =
      await Promise.all([
        this.ticketModel.countDocuments({
          ...scope,
          status: { $in: [TicketStatus.ABIERTO, TicketStatus.EN_PROCESO] },
        }),
        this.ticketModel
          .find(scope)
          .populate('client', 'name company')
          .populate('category', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .exec(),
        this.ticketModel
          .find({ ...scope, satisfaction: { $ne: null } }, 'satisfaction')
          .exec(),
        this.ticketModel
          .find(
            { ...scope, 'comments.0': { $exists: true } },
            'createdAt comments',
          )
          .exec(),
        this.ticketModel
          .find(
            {
              ...scope,
              createdAt: { $gte: new Date(Date.now() - 7 * MS_PER_DAY) },
            },
            'createdAt',
          )
          .exec(),
      ]);

    const csat =
      allForCsat.length > 0
        ? Math.round(
            (allForCsat.reduce((sum, t) => sum + (t.satisfaction ?? 0), 0) /
              allForCsat.length /
              5) *
              100,
          )
        : null;

    const responseMinutesList = allForResponse.map((t) => {
      const firstComment = t.comments[0];
      return (firstComment.createdAt.getTime() - t.createdAt.getTime()) / 60000;
    });
    const avgResponseMinutes =
      responseMinutesList.length > 0
        ? Math.round(
            responseMinutesList.reduce((sum, m) => sum + m, 0) /
              responseMinutesList.length,
          )
        : null;

    const weeklyActivity = this.buildWeeklyActivity(
      weeklyRaw.map((t) => t.createdAt),
    );

    return {
      openTickets,
      avgResponseMinutes,
      csat,
      weeklyActivity,
      recentTickets,
    };
  }

  private buildWeeklyActivity(dates: Date[]) {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 6; i >= 0; i--) {
      const day = new Date(today.getTime() - i * MS_PER_DAY);
      buckets.set(day.toDateString(), 0);
    }
    for (const date of dates) {
      const key = new Date(date);
      key.setHours(0, 0, 0, 0);
      const dateKey = key.toDateString();
      if (buckets.has(dateKey)) {
        buckets.set(dateKey, (buckets.get(dateKey) ?? 0) + 1);
      }
    }

    return [...buckets.entries()].map(([dateKey, count]) => ({
      label: DAY_NAMES[new Date(dateKey).getDay()],
      count,
    }));
  }
}
