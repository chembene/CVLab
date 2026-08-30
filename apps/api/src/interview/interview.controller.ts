import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { InterviewService } from './interview.service';
import { StartInterviewDto } from './dto/start-interview.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@Controller({ path: 'interview', version: '1' })
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post('start')
  start(@CurrentUser() user: RequestUser, @Body() dto: StartInterviewDto) {
    return this.interviewService.start(user, user.id, dto);
  }

  @Post(':id/questions')
  generateQuestions(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: GenerateQuestionsDto,
  ) {
    return this.interviewService.generateQuestions(user, user.id, id, dto);
  }

  @Post(':id/answer')
  submitAnswer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.interviewService.submitAnswer(user, user.id, id, dto);
  }

  @Post(':id/evaluate')
  evaluate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.interviewService.evaluate(user, user.id, id);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.interviewService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.interviewService.getOne(user, user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.interviewService.remove(user, user.id, id);
  }
}
