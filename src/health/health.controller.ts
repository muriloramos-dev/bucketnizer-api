import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('health')
export class HealthController {
    @Get()
    @HttpCode(HttpStatus.OK)
    async checkHealth(): Promise<{ status: string }> {
        return { status: 'OK' };
    }
}
