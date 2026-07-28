import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>) {}

  create(agentId: string, dto: CreateTaskDto) {
    return this.taskModel.create({ ...dto, agent: agentId });
  }

  findAllForAgent(agentId: string) {
    return this.taskModel
      .find({ agent: agentId })
      .sort({ done: 1, dueAt: 1 })
      .exec();
  }

  async update(id: string, agentId: string, dto: UpdateTaskDto) {
    const task = await this.taskModel
      .findOneAndUpdate({ _id: id, agent: agentId }, dto, { new: true })
      .exec();
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }
    return task;
  }

  async remove(id: string, agentId: string) {
    const result = await this.taskModel
      .findOneAndDelete({ _id: id, agent: agentId })
      .exec();
    if (!result) {
      throw new NotFoundException('Tarea no encontrada');
    }
  }
}
