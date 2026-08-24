import { Module } from '@nestjs/common';
import { SavedOutputsController } from './saved-outputs.controller';

@Module({
  controllers: [SavedOutputsController],
})
export class SavedOutputsModule {}
