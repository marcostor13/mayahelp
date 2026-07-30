import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { TicketStatus } from '../common/enums/ticket.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { Role } from '../common/enums/role.enum';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    // Project model registered in DashboardModule; ProjectsModule is not imported to
    // keep the dependency graph flat.
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
  ) {}

  /**
   * Everything the account screen shows: how the person's own tickets are doing and the
   * projects they are involved in (either as the project's client or through their tickets).
   */
  async getAccountSummary(requester: AuthenticatedUser) {
    const clientId = new Types.ObjectId(requester.userId);
    const scope = requester.role === Role.CLIENT ? { client: clientId } : {};

    const [byStatusRaw, byPriorityRaw, total, recentTickets, projectIds] =
      await Promise.all([
        this.ticketModel.aggregate<{ _id: string; total: number }>([
          { $match: scope },
          { $group: { _id: '$status', total: { $sum: 1 } } },
        ]),
        this.ticketModel.aggregate<{ _id: string; total: number }>([
          { $match: scope },
          { $group: { _id: '$priority', total: { $sum: 1 } } },
        ]),
        this.ticketModel.countDocuments(scope),
        this.ticketModel
          .find(scope)
          .populate('category', 'name icon')
          .populate('project', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
          .exec(),
        this.ticketModel.distinct('project', scope),
      ]);

    const byStatus = Object.fromEntries(
      byStatusRaw.map((row) => [row._id, row.total]),
    ) as Record<string, number>;
    const byPriority = Object.fromEntries(
      byPriorityRaw.map((row) => [row._id, row.total]),
    ) as Record<string, number>;

    const projects = await this.projectModel
      .find({
        $or: [
          { client: clientId },
          { _id: { $in: projectIds.filter(Boolean) } },
        ],
      })
      .populate('defaultCategory', 'name icon')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const projectTicketCounts = await this.ticketModel.aggregate<{
      _id: Types.ObjectId;
      total: number;
      open: number;
    }>([
      { $match: { ...scope, project: { $in: projects.map((p) => p._id) } } },
      {
        $group: {
          _id: '$project',
          total: { $sum: 1 },
          open: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [TicketStatus.ABIERTO, TicketStatus.EN_PROCESO],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const countsByProject = new Map(
      projectTicketCounts.map((row) => [row._id?.toString(), row]),
    );

    return {
      tickets: {
        total,
        open:
          (byStatus[TicketStatus.ABIERTO] ?? 0) +
          (byStatus[TicketStatus.EN_PROCESO] ?? 0),
        resolved:
          (byStatus[TicketStatus.RESUELTO] ?? 0) +
          (byStatus[TicketStatus.CERRADO] ?? 0),
        byStatus,
        byPriority,
      },
      projects: projects.map((project) => ({
        ...project,
        ticketsCount: countsByProject.get(project._id.toString())?.total ?? 0,
        openTicketsCount:
          countsByProject.get(project._id.toString())?.open ?? 0,
      })),
      recentTickets,
    };
  }

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
