function getConfiguration(issuer) {
    return fetch(issuer + "/.well-known/openid-configuration")
        .then(function (response) {
            return response.ok
                ? response.json()
                : Promise.reject(response);
        });
}

function sendAuthenticationRequest(configuration, client_id, scope) {
    var authorization_request = configuration.authorization_endpoint;
    authorization_request += "?response_type=code";
    authorization_request += "&scope=" + encodeURIComponent(scope);
    authorization_request += "&client_id=" + encodeURIComponent(client_id);
    authorization_request += "&redirect_uri=" + encodeURIComponent(location.origin + "/spa.html");
    window.open(authorization_request, "_self");
}

function invokeTokenRequest(configuration, client_id, client_secret, code) {
    var token_endpoint = configuration.token_endpoint;
    var headers = { "Content-Type": "application/x-www-form-urlencoded" };
    var body = "grant_type=authorization_code";
    body += "&code=" + encodeURIComponent(code);
    body += "&client_id=" + encodeURIComponent(client_id);
    body += "&client_secret=" + encodeURIComponent(client_secret);
    body += "&redirect_uri=" + encodeURIComponent(location.origin + "/spa.html");
    console.log("invokeTokenRequest body " + body);
    return fetch(token_endpoint, { mode: "cors", cache: "no-store", method: "POST", headers: headers, body: body })
        .then(function (response) {
            console.log("invokeTokenRequest httpResponse " + response.status);
            return response.ok
                ? response.json()
                : Promise.reject(response);
        })
        .then(function (response) {
            console.log("invokeTokenRequest tokenResponse " + JSON.stringify(response));
            return Promise.resolve(response);
        })
        .catch(function (error) {
            console.error("invokeTokenRequest error " + error);
            return Promise.reject(error);
        });
}
