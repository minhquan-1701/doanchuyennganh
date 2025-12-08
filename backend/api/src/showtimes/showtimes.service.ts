import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShowtimeDto } from './dto/create-showtime.dto';
import { UpdateShowtimeDto } from './dto/update-showtime.dto';

export interface ShowtimesQueryParams {
  page?: number;
  limit?: number;
  movieId?: number;
  screenId?: number;
  cinemaId?: number;
  status?: string;
  format?: string;
  showDate?: string;
}

@Injectable()
export class ShowtimesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async create(dto: CreateShowtimeDto) {
    const data: Prisma.showtimesUncheckedCreateInput = {
      id_movie: dto.idMovie ?? undefined,
      id_screen: dto.idScreen ?? undefined,
      show_date: new Date(dto.showDate),
      start_time: this.toTime(dto.startTime),
      end_time: this.toTime(dto.endTime),
      format: dto.format?.trim() || '2D',
      language: dto.language?.trim(),
      subtitle: dto.subtitle?.trim(),
      status: dto.status?.trim() || 'available', // Ensure default value
      price: dto.price|| '45000',
    };

    const showtime = await this.prisma.showtimes.create({ data });

    // Emit event for RAG re-indexing
    this.eventEmitter.emit('showtime.created', { id: showtime.id_showtime });

    return showtime;
  }

  async findAll(params: ShowtimesQueryParams = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const where: Prisma.showtimesWhereInput = {
      id_movie: params.movieId ?? undefined,
      id_screen: params.screenId ?? undefined,
      screen: params.cinemaId
        ? {
          id_cinema: params.cinemaId,
        }
        : undefined,
      status: params.status?.trim(),
      format: params.format?.trim(),
      show_date: params.showDate ? new Date(params.showDate) : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.showtimes.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ show_date: 'asc' }, { start_time: 'asc' }],
        include: {
          movie: true,
          screen: {
            include: {
              cinema: true,
            },
          },
        },
      }),
      this.prisma.showtimes.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const record = await this.prisma.showtimes.findUnique({
      where: { id_showtime: id },
      include: {
        movie: true,
        screen: {
          include: {
            cinema: true,
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Showtime not found');
    }
    return record;
  }

  async update(id: number, dto: UpdateShowtimeDto) {
    await this.ensureExists(id);
    const data: Prisma.showtimesUncheckedUpdateInput = {
      id_movie: dto.idMovie ?? undefined,
      id_screen: dto.idScreen ?? undefined,
      show_date: dto.showDate ? new Date(dto.showDate) : undefined,
      start_time: dto.startTime ? this.toTime(dto.startTime) : undefined,
      end_time: dto.endTime ? this.toTime(dto.endTime) : undefined,
      format: dto.format ? dto.format.trim() : undefined,
      language: dto.language ? dto.language.trim() : undefined,
      subtitle: dto.subtitle ? dto.subtitle.trim() : undefined,
      status: dto.status ? dto.status.trim() : undefined,
      price: dto.price ?? undefined,
    };

    const showtime = await this.prisma.showtimes.update({
      where: { id_showtime: id },
      data,
      include: {
        movie: true,
        screen: true,
      },
    });

    // Emit event for RAG re-indexing
    this.eventEmitter.emit('showtime.updated', { id: showtime.id_showtime });

    return showtime;
  }

  async remove(id: number) {
    await this.ensureExists(id);
    const showtime = await this.prisma.showtimes.delete({
      where: { id_showtime: id },
    });

    // Emit event for RAG re-indexing
    this.eventEmitter.emit('showtime.deleted', { id });

    return showtime;
  }

  /**
   * Get booked seat IDs for a showtime
   * Returns seat IDs that are either:
   * 1. In confirmed bookings (detail_booking)
   * 2. Temporarily locked (seat_locks with valid expiry)
   */
  async getBookedSeats(showtimeId: number): Promise<number[]> {
    await this.ensureExists(showtimeId);

    // Get seats from confirmed bookings
    const bookedSeats = await this.prisma.detail_booking.findMany({
      where: {
        booking: {
          id_showtime: showtimeId,
          booking_status: {
            in: ['confirmed', 'pending'], // Include pending bookings
          },
        },
      },
      select: {
        id_seats: true,
      },
    });

    // Get temporarily locked seats (not expired)
    const lockedSeats = await this.prisma.seat_locks.findMany({
      where: {
        id_showtime: showtimeId,
        expires_at: {
          gte: new Date(), // Not expired
        },
      },
      select: {
        id_seats: true,
      },
    });

    // Combine and deduplicate
    const allSeatIds = new Set<number>();
    bookedSeats.forEach((s) => allSeatIds.add(s.id_seats));
    lockedSeats.forEach((s) => allSeatIds.add(s.id_seats));

    return Array.from(allSeatIds);
  }

  private async ensureExists(id: number) {
    const exists = await this.prisma.showtimes.findUnique({
      where: { id_showtime: id },
      select: { id_showtime: true },
    });
    if (!exists) {
      throw new NotFoundException('Showtime not found');
    }
  }

  private toTime(value: string): Date {
    const trimmed = value.trim();
    const normalized =
      trimmed.length === 5
        ? `${trimmed}:00`
        : trimmed.length === 8
          ? trimmed
          : `${trimmed.padEnd(5, ':0')}:00`;
    return new Date(`1970-01-01T${normalized}Z`);
  }
}
