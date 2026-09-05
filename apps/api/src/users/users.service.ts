import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SAFE_USER_SELECT, type SafeUser } from './types.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<SafeUser[]> {
    return this.prisma.client.user.findMany({
      select: SAFE_USER_SELECT,
    });
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateName(id: string, name: string): Promise<SafeUser> {
    const user = await this.prisma.client.user.update({
      where: { id },
      data: { name },
      select: SAFE_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
