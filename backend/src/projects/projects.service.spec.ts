import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { ProjectsService } from './projects.service';
import { ProjectDocument } from './schemas/project.schema';
import { ProjectShareLinkDocument } from './schemas/project-share-link.schema';
import { UsersService } from '../users/users.service';

function harness(existing: Types.ObjectId | null) {
  const calls: string[] = [];
  const projectModel = {
    findByIdAndDelete: () => ({
      exec: () => {
        calls.push('project');
        return Promise.resolve(existing ? { _id: existing } : null);
      },
    }),
  } as unknown as Model<ProjectDocument>;
  const shareLinkModel = {
    deleteMany: () => ({
      exec: () => {
        calls.push('links');
        return Promise.resolve();
      },
    }),
  } as unknown as Model<ProjectShareLinkDocument>;
  const pulled: Types.ObjectId[] = [];
  const usersService = {
    removeProjectFromAll: (projectId: Types.ObjectId) => {
      pulled.push(projectId);
      return Promise.resolve();
    },
  } as unknown as UsersService;
  const service = new ProjectsService(
    projectModel,
    shareLinkModel,
    usersService,
  );
  return { service, calls, pulled };
}

describe('ProjectsService.remove', () => {
  it('saca el proyecto borrado de las cuentas que lo tenían asignado', async () => {
    const id = new Types.ObjectId();
    const { service, calls, pulled } = harness(id);

    await service.remove(id.toString());

    expect(calls).toEqual(['project', 'links']);
    expect(pulled).toEqual([id]);
  });

  it('si el proyecto no existe no toca enlaces ni asignaciones', async () => {
    const { service, calls, pulled } = harness(null);

    await expect(
      service.remove(new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toEqual(['project']);
    expect(pulled).toEqual([]);
  });
});
