# JavaScript Single Page Application and Ubisecure SSO

## Code review

This project is hosted in a ASP.NET Core Web Application.
However only the web server function of ASP.NET is used, there is no server-side logic. 
This project also runs as-is on Apache HTTP server or any other web server that serves static resources.

The code for the API invoked by this application is in [SimpleAPI](../../../SimpleAPI)

The relevant file is 

* [spa.html](wwwroot/spa.html)

### Send authentication request

```javascript
  
```

### Receive authorization code

### Invoke token request

### Validate ID Token integrity

### Invoke OAuth protected API

## Running the application

### With ASP.NET Core

1. Clone this repository
1. Install ASP.NET Core runtime from https://www.microsoft.com/net/download
1. Use `dotnet run` command run ASP.NET Core server

### With Apache HTTP server

1. Clone this repository
1. Install Apache HTTP server
1. Use `./run-apache.sh` on Linux or `run-apache.cmd` on Windows to start Apache HTTP server
