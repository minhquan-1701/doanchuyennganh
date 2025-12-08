import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService, QdrantPoint } from './qdrant.service';
import { EmbeddingsService } from './embeddings.service';

@Injectable()
export class DocumentIndexerService {
    private readonly logger = new Logger(DocumentIndexerService.name);
    private readonly BATCH_SIZE = 10;

    constructor(
        private readonly prisma: PrismaService,
        private readonly qdrant: QdrantService,
        private readonly embeddings: EmbeddingsService,
    ) { }

    async resetMoviesCollection() {
        this.logger.warn('Resetting Movies collection...');
        await this.qdrant.deleteCollection('movies');
        await this.qdrant.createCollection('movies');
        await this.indexMovies();
    }

    async resetShowtimesCollection() {
        this.logger.warn('Resetting Showtimes collection...');
        await this.qdrant.deleteCollection('showtimes');
        await this.qdrant.createCollection('showtimes');
        await this.indexShowtimes();
    }

    async resetPromotionsCollection() {
        this.logger.warn('Resetting Promotions collection...');
        await this.qdrant.deleteCollection('promotions');
        await this.qdrant.createCollection('promotions');
        await this.indexPromotions();
    }

    async resetCinemasCollection() {
        this.logger.warn('Resetting Cinemas collection...');
        await this.qdrant.deleteCollection('cinemas');
        await this.qdrant.createCollection('cinemas');
        await this.indexCinemas();
    }

    /**
     * Index all movies into Qdrant
     */
    async indexMovies(): Promise<number> {
        this.logger.log('Starting movie indexing...');

        const movies = await this.prisma.movies.findMany({
            select: {
                id_movie: true,
                title: true,
                original_title: true,
                description: true,
                director: true,
                actors: true,
                duration: true,
                release_date: true,
                language: true,
                age_restriction: true,
                country: true,
                genre_movies: {
                    select: {
                        genre: {
                            select: {
                                genre_name: true,
                            },
                        },
                    },
                },
            },
        });

        const points: QdrantPoint[] = [];
        let totalIndexed = 0;

        for (const movie of movies) {
            // Create searchable text from movie data
            const genres = movie.genre_movies.map(gm => gm.genre.genre_name).join(', ');
            const text = this.createMovieText(movie, genres);

            // Generate embedding
            const vector = await this.embeddings.generateEmbedding(text);

            points.push({
                id: movie.id_movie,
                vector,
                payload: {
                    id: movie.id_movie,
                    title: movie.title,
                    description: movie.description,
                    genres: genres,
                    director: movie.director,
                    actors: movie.actors,
                    duration: movie.duration,
                    releaseDate: movie.release_date?.toISOString(),
                    language: movie.language,
                    ageRestriction: movie.age_restriction,
                    country: movie.country,
                    type: 'movie',
                },
            });

            if (points.length >= this.BATCH_SIZE) {
                await this.qdrant.upsertPoints('movies', points);
                totalIndexed += points.length;
                this.logger.log(`Indexed ${totalIndexed}/${movies.length} movies`);
                points.length = 0; // Clear array
                await new Promise(resolve => setTimeout(resolve, 200));
            }


        }

        if (points.length > 0) {
            await this.qdrant.upsertPoints('movies', points);
            totalIndexed += points.length;
        }

        this.logger.log(`Indexed ${points.length} movies`);
        return points.length;
    }

    /**
     * Index showtimes
     */
    async indexShowtimes(): Promise<number> {
        this.logger.log('Starting showtime indexing...');

        // Get CURRENT and FUTURE showtimes only (not past ones)
        const now = new Date();

        const showtimes = await this.prisma.showtimes.findMany({
            include: {
                movie: {
                    select: {
                        title: true,
                        genre_movies: {
                            select: {
                                genre: {
                                    select: {
                                        genre_name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                screen: {
                    select: {
                        screen_name: true,
                        cinema: {
                            select: {
                                cinema_name: true,
                                address: true,
                            },
                        },
                    },
                },
            },
            where: {
                // Only get showtimes that haven't ended yet
                show_date: {
                    gte: now,  // Today and future
                },
            },
            orderBy: {
                show_date: 'asc', // Order by date ascending
            },
            // Get all future showtimes
        });

        this.logger.log(`Found ${showtimes.length} showtimes to index`);

        const points: QdrantPoint[] = [];
        const BATCH_SIZE = 10; // Upsert every 10 points
        let totalIndexed = 0;

        for (let i = 0; i < showtimes.length; i++) {
            const showtime = showtimes[i];

            try {
                if (!showtime.movie || !showtime.screen || !showtime.screen.cinema) {
                    this.logger.warn(`Skipping showtime ${showtime.id_showtime}: incomplete data`);
                    continue;
                }

                const genres = showtime.movie.genre_movies.map(gm => gm.genre.genre_name).join(', ');
                const text = this.createShowtimeText(showtime, genres);
                const vector = await this.embeddings.generateEmbedding(text);

                // Combine show_date and start_time to create full datetime
                const startDateTime = new Date(showtime.show_date);
                const [hours, minutes] = showtime.start_time.toTimeString().split(':');
                startDateTime.setHours(parseInt(hours), parseInt(minutes));

                const endDateTime = new Date(showtime.show_date);
                const [endHours, endMinutes] = showtime.end_time.toTimeString().split(':');
                endDateTime.setHours(parseInt(endHours), parseInt(endMinutes));

                points.push({
                    id: showtime.id_showtime,
                    vector,
                    payload: {
                        id: showtime.id_showtime,
                        movieTitle: showtime.movie.title,
                        genres: genres,
                        cinemaName: showtime.screen.cinema.cinema_name,
                        cinemaAddress: showtime.screen.cinema.address,
                        screenName: showtime.screen.screen_name,
                        startTime: startDateTime.toISOString(),
                        endTime: endDateTime.toISOString(),
                        showDate: showtime.show_date.toISOString(),
                        format: showtime.format,
                        language: showtime.language,
                        subtitle: showtime.subtitle,
                        price: showtime.price.toNumber(),
                        type: 'showtime',
                    },
                });

                // Batch upsert every BATCH_SIZE points
                if (points.length >= BATCH_SIZE) {
                    await this.qdrant.upsertPoints('showtimes', points);
                    totalIndexed += points.length;
                    this.logger.log(`Indexed ${totalIndexed}/${showtimes.length} showtimes`);
                    points.length = 0; // Clear array
                    await new Promise(resolve => setTimeout(resolve, 100));
                }


            } catch (error) {
                this.logger.error(`Error indexing showtime ${showtime.id_showtime}: ${error.message}`);
                // Continue with next showtime
            }
        }

        // Upsert remaining points
        if (points.length > 0) {
            await this.qdrant.upsertPoints('showtimes', points);
            totalIndexed += points.length;
        }

        this.logger.log(`Indexed ${totalIndexed} showtimes total`);
        return totalIndexed;
    }

    /**
     * Index promotions
     */
    async indexPromotions(): Promise<number> {
        this.logger.log('Starting promotion indexing...');

        const promotions = await this.prisma.promotions.findMany({
            where: {
                end_date: {
                    gte: new Date(),
                },
            },
        });

        const points: QdrantPoint[] = [];
        let totalIndexed = 0;

        for (const promotion of promotions) {
            const text = this.createPromotionText(promotion);
            const vector = await this.embeddings.generateEmbedding(text);

            points.push({
                id: promotion.id_promotions,
                vector,
                payload: {
                    id: promotion.id_promotions,
                    title: promotion.title,
                    description: promotion.description,
                    promotionCode: promotion.promotion_code,
                    discountPercent: promotion.discount_percent?.toNumber(),
                    discountAmount: promotion.discount_amount?.toNumber(),
                    startDate: promotion.start_date.toISOString(),
                    endDate: promotion.end_date?.toISOString(),
                    minPurchase: promotion.min_purchase?.toNumber(),
                    maxDiscount: promotion.max_discount?.toNumber(),
                    usageLimit: promotion.usage_limit,
                    status: promotion.status,
                    type: 'promotion',
                },
            });

            if (points.length >= this.BATCH_SIZE) {
                await this.qdrant.upsertPoints('promotions', points);
                totalIndexed += points.length;
                this.logger.log(`Indexed ${totalIndexed}/${promotions.length} promotions`);
                points.length = 0; // Clear array
                await new Promise(resolve => setTimeout(resolve, 200));
            }


        }

        if (points.length > 0) {
            await this.qdrant.upsertPoints('promotions', points);
        }

        this.logger.log(`Indexed ${points.length} promotions`);
        return points.length;
    }

    /**
     * Index cinemas
     */
    async indexCinemas(): Promise<number> {
        try {
            this.logger.log('Starting cinema indexing...');

            const cinemas = await this.prisma.cinemas.findMany({
                include: {
                    operation_hours: true,
                    screens: {
                        include: {
                            screen_type: true,
                        },
                    },
                },
                where: {
                    status: 'active',
                },
            });

            this.logger.log(`Found ${cinemas.length} cinemas to index`);

            if (cinemas.length === 0) {
                this.logger.warn('No active cinemas found to index');
                return 0;
            }

            const points: QdrantPoint[] = [];
            let totalIndexed = 0;

            for (let i = 0; i < cinemas.length; i++) {
                const cinema = cinemas[i];

                try {
                    this.logger.log(`Indexing cinema ${i + 1}/${cinemas.length}: ${cinema.cinema_name}`);

                    const text = this.createCinemaText(cinema);
                    this.logger.debug(`Created text for cinema ${cinema.id_cinema}, length: ${text.length}`);

                    const vector = await this.embeddings.generateEmbedding(text);
                    this.logger.debug(`Generated embedding for cinema ${cinema.id_cinema}, vector length: ${vector.length}`);

                    points.push({
                        id: cinema.id_cinema,
                        vector,
                        payload: {
                            id: cinema.id_cinema,
                            name: cinema.cinema_name,
                            address: cinema.address,
                            city: cinema.city,
                            description: cinema.description,
                            contactNumber: cinema.contact_number,
                            email: cinema.email,
                            screenCount: cinema.screens.length,
                            screenTypes: [...new Set(cinema.screens.map((s: any) => s.screen_type?.type_name).filter(Boolean))],
                            operationHours: cinema.operation_hours.map((oh: any) => ({
                                dayOfWeek: oh.day_of_week,
                                openTime: oh.opening_time?.toTimeString().substring(0, 5),
                                closeTime: oh.closing_time?.toTimeString().substring(0, 5),
                            })),
                            type: 'cinema',
                        },
                    });
                    if (points.length >= this.BATCH_SIZE) {
                        await this.qdrant.upsertPoints('cinemas', points);
                        totalIndexed += points.length;
                        this.logger.log(`Indexed ${totalIndexed}/${cinemas.length} cinemas`);
                        points.length = 0; // Clear array
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }


                } catch (error) {
                    this.logger.error(`Error indexing cinema ${cinema.id_cinema} (${cinema.cinema_name}): ${error.message}`);
                    this.logger.error(error.stack);
                    // Continue with next cinema
                }
            }

            if (points.length > 0) {
                this.logger.log(`Upserting ${points.length} cinema points to Qdrant...`);
                await this.qdrant.upsertPoints('cinemas', points);
                totalIndexed = points.length;
                this.logger.log(`Successfully upserted ${totalIndexed} cinemas`);
            }

            this.logger.log(`Indexed ${totalIndexed} cinemas total`);
            return totalIndexed;
        } catch (error) {
            this.logger.error(`Fatal error in indexCinemas: ${error.message}`);
            this.logger.error(error.stack);
            throw error;
        }
    }

    /**
     * Index all data
     */
    async indexAll(): Promise<{ movies: number; showtimes: number; promotions: number; cinemas: number }> {
        const [movies, showtimes, promotions, cinemas] = await Promise.all([
            this.indexMovies(),
            this.indexShowtimes(),
            this.indexPromotions(),
            this.indexCinemas(),
        ]);

        return { movies, showtimes, promotions, cinemas };
    }

    async deleteMovie(id: number) {
        await this.qdrant.deletePoints('movies', [id]);
    }

    async deleteShowtime(id: number) {
        await this.qdrant.deletePoints('showtimes', [id]);
    }

    async deletePromotion(id: number) {
        await this.qdrant.deletePoints('promotions', [id]);
    }

    async deleteCinema(id: number) {
        await this.qdrant.deletePoints('cinemas', [id]);
    }


    async countMoviesInDb(): Promise<number> {
        return this.prisma.movies.count();
    }
    async countMoviesInQdrant(): Promise<number> {
        // Giả sử QdrantService của bạn có method này, nếu chưa có hãy xem phần chú thích cuối bài
        return this.qdrant.countCollection('movies');
    }

    async countShowtimesInDb(): Promise<number> {
        const now = new Date();
        return this.prisma.showtimes.count({
            where: {
                show_date: { gte: now },  // Match the indexing filter
            },
        });
    }
    async countShowtimesInQdrant(): Promise<number> {
        return this.qdrant.countCollection('showtimes');
    }

    // 3. Promotions Count (Khớp điều kiện active)
    async countPromotionsInDb(): Promise<number> {
        return this.prisma.promotions.count({
            where: {
                end_date: { gte: new Date() },
            },
        });
    }
    async countPromotionsInQdrant(): Promise<number> {
        return this.qdrant.countCollection('promotions');
    }

    // 4. Cinemas Count (Khớp điều kiện active)
    async countCinemasInDb(): Promise<number> {
        return this.prisma.cinemas.count({
            where: { status: 'active' },
        });
    }
    async countCinemasInQdrant(): Promise<number> {
        return this.qdrant.countCollection('cinemas');
    }

    // Helper methods to create searchable text
    private createMovieText(movie: any, genres: string): string {
        // Create RICH text for better semantic search and fuzzy matching
        // Repeat title multiple times to boost its importance in the embedding
        // Include original_title to catch alternative spellings/names
        const text = `
${movie.title} ${movie.title} ${movie.title}
${movie.original_title || movie.title}
Tên phim: ${movie.title}
Tên gốc: ${movie.original_title || ''}
Thể loại phim: ${genres || ''}
Thể loại: ${genres || ''}
Mô tả phim: ${movie.description || ''}
${movie.description || ''}
Đạo diễn bởi: ${movie.director || ''}
Đạo diễn: ${movie.director || ''}
Diễn viên chính: ${movie.actors || ''}
Cast: ${movie.actors || ''}
Thời lượng chiếu: ${movie.duration || ''} phút
Ngôn ngữ: ${movie.language || ''}
Tiếng: ${movie.language || ''}
Quốc gia sản xuất: ${movie.country || ''}
Xuất xứ: ${movie.country || ''}
Độ tuổi giới hạn: ${movie.age_restriction || ''}
Phân loại: ${movie.age_restriction || ''}
`.trim();

        return text;
    }

    private createShowtimeText(showtime: any, genres: string): string {
        const date = new Date(showtime.show_date);
        const startTime = showtime.start_time.toTimeString().substring(0, 5);
        return ` 
      Phim: ${showtime.movie.title} 
      Thể loại: ${genres} 
      Rạp : ${showtime.screen.cinema.cinema_name}
      Địa chỉ: ${showtime.screen.cinema.address}
      Phòng : ${showtime.screen.screen_name}
      Ngày chiếu: ${date.toLocaleDateString('vi-VN')}
      Giờ chiếu: ${startTime} 
      Định dạng: ${showtime.format || '2D'}
      Ngôn ngữ: ${showtime.language || ''}
      Phụ đề: ${showtime.subtitle || ''}
      Giá vé: ${showtime.price.toNumber().toLocaleString('vi-VN')} VNĐ
    `.trim();
    }

    private createPromotionText(promotion: any): string {
        return `        
      Khuyến mãi: ${promotion.title}
      Mô tả: ${promotion.description || ''}
      Mã: ${promotion.promotion_code} 
      Giảm giá: ${promotion.discount_percent?.toNumber() || 0}%
      Giảm tiền : ${promotion.discount_amount?.toNumber().toLocaleString('vi-VN') || 0} VNĐ
      Thời gian: ${new Date(promotion.start_date).toLocaleDateString('vi-VN')} - ${new Date(promotion.end_date).toLocaleDateString('vi-VN')}
      Mua tối thiểu : ${promotion.min_purchase?.toNumber().toLocaleString('vi-VN') || 0} VNĐ
    `.trim();
    }

    private createCinemaText(cinema: any): string {
        const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const operationHoursText = cinema.operation_hours
            .map((oh: any) => `${dayNames[oh.day_of_week]}: ${oh.opening_time?.toTimeString().substring(0, 5)} - ${oh.closing_time?.toTimeString().substring(0, 5)}`)
            .join(', ');

        return `  
      Rạp chiếu phim: ${cinema.cinema_name}
      Địa chỉ: ${cinema.address} 
      Thành phố: ${cinema.city} 
      Mô tả: ${cinema.description || ''} 
      Số điện thoại : ${cinema.contact_number || ''}   
      Email: ${cinema.email || ''} 
      Số phòng chiếu: ${cinema.screens.length}
      Loại phòng: ${[...new Set(cinema.screens.map((s: any) => s.screen_type?.type_name).filter(Boolean))].join(', ')}
      Giờ mở cửa: ${operationHoursText}
    `.trim();
    }
}
