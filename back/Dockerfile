FROM swift:6.2-jammy

WORKDIR /app

COPY Package.swift Package.resolved ./

RUN swift package resolve

COPY . .

RUN swift build -c release --product App

RUN mkdir -p /data \
    && ln -s /data/db.sqlite /app/db.sqlite

EXPOSE 8081

CMD [".build/release/App", "serve", "--hostname", "0.0.0.0", "--port", "8081"]
