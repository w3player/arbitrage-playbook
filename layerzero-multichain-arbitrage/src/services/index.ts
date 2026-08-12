import { AppService } from './app.service';
import { ScanService } from './scan.service';
import { ScheduleService } from './schedule.service';

export { AppService } from './app.service';
export { ScanService } from './scan.service';
export { ScheduleService } from './schedule.service';

export const SERVICES = [AppService, ScanService, ScheduleService];
