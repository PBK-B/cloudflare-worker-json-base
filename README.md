<!--
 * @Author: Bin
 * @Date: 2024-05-10
 * @FilePath: /worker-json-base/README.md
-->

# cloudflare-worker-json-base

> This is a JSON Storage for use cloudflare workers, Pay tribute to [jsonbase.com](https://web.archive.org/web/20221007050426/https://jsonbase.com/) Fork based on [theowenyoung/blog](https://github.com/theowenyoung/blog/blob/main/scripts/jsonbin/main.js)

## Use

> Generally, Bearer token authentication is used, that is, adding `Authorization: Bearer MYDATABASEKEY` to the header information. Of course, passing `key` through URL parameters is also supported for authentication for example: `https://worker-json-base.your.workers.dev/demo_bucket/hello?key=MYDATABASEKEY`.
>
> **Note: Please modify the project key at [/src/index.js#L20](/src/index.js#L20) before deployment**

**POST**

request

```
curl --location 'https://worker-json-base.your.workers.dev/demo_bucket/hello' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer MYDATABASEKEY' \
--data '{ "hello": "world" }'
```

> Support uploading files, Examples are as follows:

```
curl --location --request GET 'https://worker-json-base.zmide.workers.dev/demo_bucket/logo.svg' \
--header 'Accept: application/json' \
--header 'Content-Type: image/svg+xml' \
--header 'Authorization: Bearer MYDATABASEKEY' \
--data '@/Users/your/Downloads/logo.svg'
```

response

```
{ "status": 1, "message": "storage ok" }
```

**GET**

request

```
curl --location --request GET 'https://worker-json-base.your.workers.dev/demo_bucket/hello' \
--header 'Accept: application/json' \
--header 'Authorization: Bearer MYDATABASEKEY' \
```

response

```
{ "hello": "world" }
```

## Deploy 😋

> You can refer to [@owenyoung](https://github.com/theowenyoung)'s blog <https://www.owenyoung.com/blog/jsonbin/>. [I am looking forward] Of course, I also hope that someone can contribute deployment documents or blogs

## Features 🎉

- Support JSON object storage

- Support ordinary text storage

- Support any other type of small file storage

- [TODO] Friendly documentation

- [TODO] Have a beautiful project homepage and visual console

- [TODO] Write and deploy project guide site (trial projects are not provided)

> The project is in progress. **Looking forward to your contribution**. Contribution methods and guidelines reference <https://www.contributor-covenant.org>

## Thank ⭐️

<https://www.owenyoung.com/blog/jsonbin>

<https://github.com/huhuhang/jsonbase>
