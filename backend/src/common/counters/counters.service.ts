import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from './counter.schema';

@Injectable()
export class CountersService {
  constructor(
    @InjectModel(Counter.name) private counterModel: Model<CounterDocument>,
  ) {}

  async next(key: string): Promise<number> {
    const counter = await this.counterModel.findOneAndUpdate(
      { key },
      { $inc: { value: 1 } },
      { new: true, upsert: true },
    );
    return counter.value;
  }
}
