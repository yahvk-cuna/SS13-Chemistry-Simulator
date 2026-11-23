{
  description = "Tianguan13 / SS13 药物代谢与伤势模拟器";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix/0456acb1b7394fc14c414b056aa889df5124943a";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      bun2nix,
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      eachSystem = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = eachSystem (
        system:
        import nixpkgs {
          inherit system;
          overlays = [ bun2nix.overlays.default ];
        }
      );
      manifest = builtins.fromJSON (builtins.readFile ./package.json);
    in
    {
      packages = eachSystem (
        system:
        let
          pkgs = pkgsFor.${system};
        in
        {
          default = pkgs.stdenv.mkDerivation {
            pname = manifest.name;
            version = manifest.version;

            src = pkgs.lib.cleanSource ./.;

            nativeBuildInputs = [
              pkgs.bun2nix.hook
            ];

            bunDeps = pkgs.bun2nix.fetchBunDeps {
              bunNix = ./bun.nix;
            };

            buildPhase = ''
              runHook preBuild
              bun run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -R ./dist/. $out/
              runHook postInstall
            '';
          };
        }
      );

      devShells = eachSystem (
        system:
        let
          pkgs = pkgsFor.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.bun2nix
            ];
          };
        }
      );

      nixosModules.default =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          cfg = config.services.ss13-chem-sim;
          normalizedBasePath =
            if cfg.basePath == "/" then "/" else "${lib.removeSuffix "/" cfg.basePath}/";
        in
        {
          options.services.ss13-chem-sim = {
            enable = lib.mkEnableOption "Tianguan13 / SS13 药物代谢与伤势模拟器静态站点";

            hostName = lib.mkOption {
              type = lib.types.str;
              default = "localhost";
              example = "chem.example.com";
              description = "Nginx 虚拟主机域名。";
            };

            basePath = lib.mkOption {
              type = lib.types.str;
              default = "/";
              example = "/chem/";
              description = "Nginx 挂载路径。";
            };

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
              description = "要托管的静态站点构建包。";
            };
          };

          config = lib.mkIf cfg.enable {
            services.nginx.enable = lib.mkDefault true;

            services.nginx.virtualHosts.${cfg.hostName}.locations.${normalizedBasePath} =
              if normalizedBasePath == "/" then
                {
                  root = cfg.package;
                  index = "index.html";
                  tryFiles = "$uri $uri/ /index.html";
                }
              else
                {
                  alias = "${cfg.package}/";
                  index = "index.html";
                  tryFiles = "$uri $uri/ ${normalizedBasePath}index.html";
                };
          };
        };
    };
}
