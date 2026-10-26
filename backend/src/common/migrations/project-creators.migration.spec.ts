import { Connection, Model, Types } from 'mongoose';
import {
  PROJECT_CREATORS_MIGRATION,
  ProjectCreatorsMigration,
} from './project-creators.migration';
import { ProjectDocument } from '../../projects/schemas/project.schema';
import { UserDocument } from '../../users/schemas/user.schema';

const CREATOR = new Types.ObjectId();
const PROJECT = new Types.ObjectId();

function harness(alreadyApplied: boolean) {
  const insertOne = jest.fn().mockResolvedValue({});
  const connection = {
    collection: () => ({
      findOne: () =>
        Promise.resolve(
          alreadyApplied ? { _id: PROJECT_CREATORS_MIGRATION } : null,
        ),
      insertOne,
    }),
  } as unknown as Connection;
  const find = jest.fn().mockReturnValue({
    lean: () => ({
      exec: () => Promise.resolve([{ _id: PROJECT, createdBy: CREATOR }]),
    }),
  });
  const bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  const migration = new ProjectCreatorsMigration(
    connection,
    { find } as unknown as Model<ProjectDocument>,
    { bulkWrite } as unknown as Model<UserDocument>,
  );
  return { migration, find, bulkWrite, insertOne };
}

describe('ProjectCreatorsMigration', () => {
  /** Los proyectos creados antes del arreglo le quedaban invisibles a su creador. */
  it('le asigna a cada creador su proyecto, salvo al súper usuario', async () => {
    const { migration, bulkWrite, insertOne } = harness(false);

    await migration.onApplicationBootstrap();

    expect(bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: {
            _id: CREATOR,
            isSuperAdmin: { $ne: true },
            projects: { $exists: true, $ne: PROJECT },
          },
          update: { $addToSet: { projects: PROJECT } },
        },
      },
    ]);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: PROJECT_CREATORS_MIGRATION }),
    );
  });

  /** Si no, cada reinicio deshacería que alguien saque a un creador de su proyecto. */
  it('no vuelve a correr', async () => {
    const { migration, find, bulkWrite, insertOne } = harness(true);

    await migration.onApplicationBootstrap();

    expect(find).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
