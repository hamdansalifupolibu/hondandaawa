module.exports = {
    apps: [{
        name: "mp-tracker",
        script: "./server.js",
        cwd: "./",
        env: {
            NODE_ENV: "production",
            PORT: 3000
        },
        watch: false,
        max_memory_restart: '500M',
        restart_delay: 3000
    }]
}
